/* eslint-disable @typescript-eslint/ban-types */
import { BasicRequestEnv } from "@effect-app-boilerplate/messages/RequestLayers"
import { Role } from "@effect-app-boilerplate/models/User"
import type { User } from "@effect-app-boilerplate/models/User"
import type { SupportedErrors } from "@effect-app/infra/api/defaultErrorHandler"
import { defaultErrorHandler } from "@effect-app/infra/api/defaultErrorHandler"
import type { _E, _R, Request } from "@effect-app/infra/api/express/schema/requestHandler"
import type { Flatten, ReqFromSchema, ReqHandler, ResFromSchema, RouteMatch } from "@effect-app/infra/api/routing"
import { handle, match } from "@effect-app/infra/api/routing"
import { NotLoggedInError, UnauthorizedError } from "@effect-app/infra/errors"
import { RequestContext } from "@effect-app/infra/RequestContext"
import type { GetRequest, GetResponse, ReqRes, ReqResSchemed } from "@effect-app/prelude/schema"
import type express from "express"
import { CurrentUser, UserRepo } from "../services.js"
import { makeUserProfileFromUserHeader, UserProfile } from "../services/UserProfile.js"

function RequestEnv(handler: { Request: any }) {
  return (req: express.Request, _res: express.Response, requestContext: RequestContext) => {
    const allowAnonymous = !!handler.Request.allowAnonymous
    const allowedRoles: readonly Role[] = handler.Request.allowedRoles ?? ["manager"]
    return Effect.gen(function*($) {
      const ctx = yield* $(BasicRequestEnv(requestContext))

      const p = makeUserProfileFromUserHeader(req.headers["x-user"])
        .map(Option.some)
      const userProfile = allowAnonymous
        ? p.catchAll(() => Effect(Option.none))
        : p.mapError(() => new NotLoggedInError())

      return pipe(
        ctx,
        Context.add(UserProfile)(
          UserProfile.make({ get: userProfile.flatMap(_ => _.encaseInEffect(() => new NotLoggedInError())) })
        )
      )
    }).flatMap(ctx =>
      Effect.gen(function*($) {
        const currentUser = yield* $(
          UserRepo.accessWithEffect(_ => _.getCurrentUser)
            .map(Option.some)
            .catchAll(() => allowAnonymous ? Effect(Option.none) : Effect.fail(new NotLoggedInError()))
            .tap(_ => {
              const userRoles = _.map(_ => _.role === "manager" ? [Role("manager"), Role("user")] : [_.role]).getOrElse(
                () => [Role("user")]
              )
              return allowedRoles.some(_ => userRoles.includes(_))
                ? Effect.unit
                : Effect.fail(new UnauthorizedError())
            })
            .map(_ => CurrentUser.make({ get: _.encaseInEffect(() => new NotLoggedInError()) }))
        )

        return pipe(
          ctx,
          Context.add(CurrentUser)(currentUser)
        )
      }).provideSomeContextReal(ctx)
    )
  }
}

/**
 * Gather all handlers of a module and attach them to the Server.
 * If no `allowAnonymous` flag is on the Request, will require a valid authenticated user.
 */
export function matchAll<T extends RequestHandlers>(handlers: T) {
  const mapped = handlers.$$.keys.reduce((prev, cur) => {
    prev[cur] = match(handlers[cur] as any, defaultErrorHandler, handleRequestEnv)
    return prev
  }, {} as any) as RouteAllLoggedIn<typeof handlers>

  return mapped
}

/**
 * Gather all handlers of a module and attach them to the Server.
 * If no `allowAnonymous` flag is on the Request, will require a valid authenticated user.
 */

export function matchAllAlt<T extends RequestHandlersTest>(handlers: T) {
  const mapped = handlers.$$.keys.reduce((prev, cur) => {
    const matches = matchAll(handlers[cur])
    matches.$$.keys.forEach(key => prev[`${cur as string}.${key as string}`] = matches[key])
    return prev
  }, {} as any) as Flatten<RouteAllLoggedInTest<typeof handlers>>

  return mapped
}

export type SupportedRequestHandler = RequestHandler<any, any, any, any, any, any, any, any, SupportedErrors>

export interface RequestHandler<
  R,
  PathA,
  CookieA,
  QueryA,
  BodyA,
  HeaderA,
  ReqA extends PathA & QueryA & BodyA,
  ResA,
  ResE
> {
  adaptResponse?: any
  h: (i: PathA & QueryA & BodyA & {}, ctx: { context: RequestContext; user: User }) => Effect<R, ResE, ResA>
  Request: Request<PathA, CookieA, QueryA, BodyA, HeaderA, ReqA>
  Response: ReqRes<unknown, ResA> | ReqResSchemed<unknown, ResA>
  ResponseOpenApi?: any
}

export type RequestHandlers = { [key: string]: SupportedRequestHandler }
export type RequestHandlersTest = {
  [key: string]: Record<string, SupportedRequestHandler>
}

type RouteAll<T extends RequestHandlers> = {
  [K in keyof T]: T[K] extends RequestHandler<
    infer R,
    any, // infer PathA,
    any, // infer CookieA,
    any, // infer QueryA,
    any, // infer BodyA,
    any, // infer HeaderA,
    any, // infer ReqA,
    any, // infer ResA,
    SupportedErrors // infer ResE
  > ? RouteMatch<R, never>
    : never
}

export type RouteAllTest<T extends RequestHandlersTest> = {
  [K in keyof T]: RouteAll<T[K]>
}

type ContextA<X> = X extends Context<infer A> ? A : never
export type RequestEnv = ContextA<Effect.Success<ReturnType<ReturnType<typeof RequestEnv>>>>

function handleRequestEnv<
  R,
  PathA,
  CookieA,
  QueryA,
  BodyA,
  HeaderA,
  ReqA extends PathA & QueryA & BodyA,
  ResA,
  ResE
>(
  handler: RequestHandler<R, PathA, CookieA, QueryA, BodyA, HeaderA, ReqA, ResA, ResE>
) {
  return {
    handler: {
      ...handler,
      h: (pars: any) =>
        Effect.struct({
          context: RequestContext.Tag.access,
          user: CurrentUser.get.catchTag("NotLoggedInError", () => Effect(null))
        })
          .flatMap(ctx => (handler.h as (i: any, ctx: any) => Effect<R, ResE, ResA>)(pars, ctx))
    },
    makeContext: RequestEnv(handler)
  }
}

type RouteAllLoggedIn<T extends RequestHandlers> = {
  [K in keyof T]: T[K] extends RequestHandler<
    infer R,
    any, // infer PathA,
    any, // infer CookieA,
    any, // infer QueryA,
    any, // infer BodyA,
    any, // infer HeaderA,
    any, // infer ReqA,
    any, // infer ResA,
    SupportedErrors // infer ResE
  > ? RouteMatch<R, RequestEnv>
    : never
}

export type RouteAllLoggedInTest<T extends RequestHandlersTest> = {
  [K in keyof T]: RouteAllLoggedIn<T[K]>
}

export function matchResource<TModules extends Record<string, Record<string, any>>>(mod: TModules) {
  type Keys = keyof TModules
  return <
    THandlers extends {
      [K in Keys]: (
        req: ReqFromSchema<GetRequest<TModules[K]>>,
        ctx: { context: RequestContext; user: User }
      ) => Effect<any, SupportedErrors, ResFromSchema<GetResponse<TModules[K]>>>
    }
  >(
    handlers: THandlers
  ) => {
    const handler = mod.$$.keys.reduce((prev, cur) => {
      prev[cur] = handle(mod[cur])(handlers[cur] as any)
      return prev
    }, {} as any)
    type HNDLRS = typeof handlers
    return handler as {
      [K in Keys]: ReqHandler<
        ReqFromSchema<GetRequest<TModules[K]>>,
        _R<ReturnType<HNDLRS[K]>>,
        _E<ReturnType<HNDLRS[K]>>,
        ResFromSchema<GetResponse<TModules[K]>>,
        GetRequest<TModules[K]>,
        GetResponse<TModules[K]>,
        { context: RequestContext; user: User }
      >
    }
  }
}

export * from "@effect-app/infra/api/routing"
