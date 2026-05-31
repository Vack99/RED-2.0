import { describe, it, expect } from "vitest";
import { decideRedirect } from "./auth";

describe("decideRedirect", () => {
  it("sends an unauthenticated visitor to /login", () => {
    expect(decideRedirect(false, "/inicio")).toBe("/login");
    expect(decideRedirect(false, "/clientes")).toBe("/login");
  });

  it("lets an unauthenticated visitor stay on /login", () => {
    expect(decideRedirect(false, "/login")).toBeNull();
  });

  it("bounces an authenticated visitor off /login to /inicio", () => {
    expect(decideRedirect(true, "/login")).toBe("/inicio");
  });

  it("lets an authenticated visitor through to app routes", () => {
    expect(decideRedirect(true, "/inicio")).toBeNull();
    expect(decideRedirect(true, "/vender")).toBeNull();
  });
});
