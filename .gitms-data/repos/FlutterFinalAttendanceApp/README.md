# FlutterFinalAttendanceApp

A Flutter client paired with a Java-based university management backend, structured as an attendance-tracking application.

## What it does

<!-- TODO: describe the core attendance-tracking features, since entry-point source files could not be read -->
The repository is split into two main parts: a `client` directory containing a Flutter application (with `lib/models`, `lib/pages`, and `lib/services` folders, suggesting a typical MVC-style mobile app structure), and a `university-management` directory containing a Maven-based Java project (likely a Spring Boot backend, based on `pom.xml` and `mvnw` wrapper scripts).

## Tech stack

- **Client**: Flutter/Dart (`client/pubspec.yaml`), with platform support for Android, iOS, Linux, macOS, Web, and Windows
- **Backend**: Java project managed with Maven (`university-management/pom.xml`, `mvnw`)

## Getting started

<!-- TODO: add install/run instructions once pubspec.yaml dependencies and pom.xml details are confirmed -->

For the Flutter client:
```
cd client
flutter pub get
flutter run
```

For the backend (Maven wrapper present):
```
cd university-management
./mvnw spring-boot:run
```

## License

No license file is present in this repository yet.
