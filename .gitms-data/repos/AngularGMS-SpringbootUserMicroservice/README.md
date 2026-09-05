# AngularGMS-SpringbootUserMicroservice

Spring Boot microservice for user management with JWT-based authentication

## What it does

<!-- TODO: describe the microservice's endpoints and behaviour; entry-point source files could not be read -->
Based on the declared dependencies, this microservice exposes web services backed by a MySQL database via JPA, and secures them using Spring Security with JWT tokens (java-jwt). It is described in the pom.xml as "microsservice", suggesting it is one component of a larger system (likely paired with an Angular front end, per the repository name).

## Tech stack

- Java
- Spring Boot (spring-boot-starter-parent)
- Spring Data JPA
- Spring Web Services (spring-boot-starter-web-services)
- Spring Security
- MySQL (mysql-connector-j)
- JWT (java-jwt)
- Lombok
- Spring Boot DevTools
- Spring Boot Starter Test

## Getting started

This project uses Maven. With the included wrapper:

```bash
./mvnw spring-boot:run
```

<!-- TODO: document required application.properties/environment variables (e.g. MySQL connection, JWT secret) -->

## License

No license file is present in this repository.
