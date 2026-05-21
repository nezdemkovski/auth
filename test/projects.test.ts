import { describe, expect, test } from "bun:test";

import { parseProjects } from "../src/config/projects";

describe("parseProjects", () => {
  test("parses project configuration", () => {
    const projects = parseProjects(
      JSON.stringify([
        {
          slug: "service-1",
          name: "Service 1",
          schema: "service_1_auth",
          trustedOrigins: ["http://localhost:5173"]
        }
      ])
    );

    expect(projects).toEqual([
      {
        slug: "service-1",
        name: "Service 1",
        schema: "service_1_auth",
        trustedOrigins: ["http://localhost:5173"]
      }
    ]);
  });

  test("rejects duplicate slugs", () => {
    expect(() =>
      parseProjects(
        JSON.stringify([
          {
            slug: "service",
            name: "Service",
            schema: "service_auth",
            trustedOrigins: []
          },
          {
            slug: "service",
            name: "Other",
            schema: "other_auth",
            trustedOrigins: []
          }
        ])
      )
    ).toThrow("Duplicate project slug");
  });
});
