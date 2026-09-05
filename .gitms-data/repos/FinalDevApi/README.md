# FinalDevApi

Angular front-end for managing a video game catalog with login, genre search, and admin-guarded CRUD views

![Language](https://img.shields.io/badge/language-TypeScript-blue)

## What it does
This is an Angular application with components for listing, adding, and updating games and genres (`games`, `add-game`, `update-game`, `liste-genres`, `update-genre`), searching games by name or genre (`recherche-par-nom`, `recherche-par-genre`), and a login flow with an authentication guard (`game.guard.ts`, `services/auth.service`). The `GameGuard` restricts navigation to certain routes based on `AuthService.isAdmin()`, redirecting unauthorized users to a `forbidden` page. Routing is configured via `app-routing.module.ts`, and the app uses Angular's `HttpClientModule` and `FormsModule`.

## Tech stack
- Angular (`@angular/core`, `@angular/router`, `@angular/common/http`, `@angular/forms`)
- RxJS
- TypeScript, HTML, CSS
- zone.js

<!-- TODO: no package.json manifest was found in the evidence, so exact Angular CLI version and full dependency list could not be confirmed -->

## Getting started
<!-- TODO: no package.json or angular.json was found, so exact install/run commands could not be confirmed -->
This appears to be a standard Angular CLI project; the entry point is `src/main.ts`, bootstrapped via `platformBrowserDynamic().bootstrapModule(AppModule)`.

## License
No license file is present in the repository.
