# @effect-app/boilerplate

## Setup

1. `pnpm i` from root
2. open a typescript file, and set VSCode's Typescript version to use the workspace version:
   - TypeScript: Select TypeScript version: Use workspace version

## Run

(VSCode tasks.json in progress)

### API, Models, Resources

a) `pnpm build -w`
b) `cd _project/api && pnpm dev`

Visit: http://localhost:3610/docs
The API is also proxied in the frontend on /api

### Frontend (Nuxt)

- `cd _project/frontend-nuxt && pnpm dev -o`

Visit: http://localhost:5281
API Docs: http://localhost:5281/api/docs

Notes

- Make sure you don't have the old Vue/Vetur vs code plugin installed, but the new ones only: "Vue.volar", "Vue.vscode-typescript-vue-plugin"

### Helpful editor hints

Add to keybinds:

```json
{
    "key": "ctrl+shift+i",
    "command": "editor.action.sourceAction",
    "args": {
        "kind": "source.addMissingImports",
        "apply": "first"
    }
}
```


### Data type architecture/hierarchy

Sketch..

![alt text](doc/img/data-arch.png)


### Concepts

- Applications
  - API - private business logic, endpoints with resources for UI
  - UI - views and public business logic, uses derived clients to talk to endpoints on the API
- Messages - talk between API/Worker services
- Resources - talk between UI and API - think REST resources, actions, view models.
- Models - domain core types, many others are derived from these

#### Queries (read) & Commands/Mutations (write)

TBD

### Messaging

TBD
#### Events

TBD

- Published to UI via Server Sent Events