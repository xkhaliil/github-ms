import { describe, expect, it } from "vitest";
import { isExpectedApiNoise } from "../core/github/client.js";

/**
 * These strings are copied verbatim from a real scan of an undocumented account.
 * The filter has to key off the actual request-log format, not an assumed one.
 */
describe("isExpectedApiNoise", () => {
  it("silences a missing README - that is the thing gitms is looking for", () => {
    expect(
      isExpectedApiNoise(
        "GET /repos/xkhaliil/atelier-01/readme - 404 with id DBEF:2043A:8A4ED5B:8619D0A:6A9C406C in 550ms",
      ),
    ).toBe(true);
  });

  it("silences missing manifests, languages and commit history", () => {
    expect(isExpectedApiNoise("GET /repos/me/x/contents/package.json - 404 with id A in 10ms")).toBe(
      true,
    );
    expect(isExpectedApiNoise("GET /repos/me/x/languages - 404 with id A in 10ms")).toBe(true);
    expect(isExpectedApiNoise("GET /repos/me/x/commits - 404 with id A in 10ms")).toBe(true);
  });

  it("silences the 409 an empty repository returns for its tree", () => {
    expect(isExpectedApiNoise("GET /repos/me/x/git/trees/main - 409 with id A in 10ms")).toBe(true);
  });

  it("still reports a 409 when writing a README - that is a real conflict", () => {
    expect(
      isExpectedApiNoise("PUT /repos/me/x/contents/README.md - 409 with id A in 10ms"),
    ).toBe(false);
  });

  it("still reports auth and permission failures", () => {
    expect(isExpectedApiNoise("GET /user - 401 with id A in 10ms")).toBe(false);
    expect(isExpectedApiNoise("PATCH /repos/me/x - 403 with id A in 10ms")).toBe(false);
    expect(isExpectedApiNoise("PUT /repos/me/x/topics - 404 with id A in 10ms")).toBe(false);
  });

  it("still reports server errors on the same endpoints", () => {
    expect(isExpectedApiNoise("GET /repos/me/x/readme - 500 with id A in 10ms")).toBe(false);
  });
});
