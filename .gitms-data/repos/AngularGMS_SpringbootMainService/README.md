# AngularGMS_SpringbootMainService

Spring Boot backend service providing authentication and data persistence, built with Spring Security, JWT, and JPA.

## What it does

<!-- TODO: describe the actual endpoints and business logic; entry-point source files could not be read -->
Based on the declared dependencies, this service exposes web endpoints (Spring Web, Spring Web Services), secures them with Spring Security and JWT (java-jwt), persists data via Spring Data JPA to a MySQL database (mysql-connector-j), and renders server-side views with Thymeleaf (including Bootstrap and jQuery assets, and Spring Security Thymeleaf extras). The repository name suggests this is the main backend service for a project pairing an Angular frontend with this Spring Boot service, but no frontend code is present in this repository.

## Tech stack

- Java, Maven (Spring Boot Starter Parent)
- Spring Boot: Web, Web Services, Data JPA, Security, Validation, Thymeleaf, DevTools
- MySQL (mysql-connector-j)
- JWT via `java-jwt`
- Thymeleaf Layout Dialect, Spring Security Thymeleaf extras
- Bootstrap, jQuery (bundled front-end assets for server-rendered views)
- Lombok
- JSTL (Tomcat Embed Jasper, Jakarta JSTL, Glassfish JSTL) for JSP support

## Getting started

```bash
./mvnw spring-boot:run
```

A MySQL database connection must be configured (see `src/main/resources`, not included in this evidence bundle).

<!-- TODO: document required application.properties/application.yml configuration (DB credentials, JWT secret, etc.) -->

## License

No license file is present in this repository.
