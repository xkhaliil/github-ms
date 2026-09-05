# SpringBootCloudV2.0

Microservices-based system combining Spring Boot services with an Angular front end

## What it does
The repository contains several independent Spring Boot Maven projects — a `gateway`, a `service-registry`, a `UserMicroService`, and an `AngularGMS_SpringbootMainService` — alongside an Angular application (`AngularFront-main`) that serves as the client. The presence of `gateway` and `service-registry` modules, each with their own `pom.xml` and Maven wrapper scripts, indicates a Spring Cloud microservices architecture (likely using Eureka-style service discovery and an API gateway), though the specific Spring Cloud dependencies could not be confirmed since no manifest contents were parsed. The Angular front end is a standard Angular CLI project with its own `package.json`, `karma.conf.js` for testing, and a bootstrap entry point in `src/main.ts`.

<!-- TODO: describe what each microservice (UserMicroService, GMS main service) actually manages, based on manifest/source inspection -->

## Tech stack
- Java (Spring Boot, Maven — `pom.xml` per module: gateway, service-registry, UserMicroService, AngularGMS_SpringbootMainService)
- Angular (TypeScript) front end with Karma/Jasmine for testing
- Maven wrapper (`mvnw`) present in each Java module

## Getting started
<!-- TODO: add explicit build/run steps for each Spring Boot module and the Angular app; no dependency versions were available to confirm exact commands -->

Each Java module can likely be built and run via its Maven wrapper, e.g. `./mvnw spring-boot:run`, from within that module's directory. The Angular app in `AngularFront-main` uses a standard `package.json` and Angular CLI setup, so it likely runs via `npm install` followed by `ng serve`, though exact scripts were not confirmed from the evidence.

<!-- TODO: add a screenshot -->

## License
No license file is present in this repository.