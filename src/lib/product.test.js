import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adminNavigation,
  productDescription,
  productName,
  studentNavigation
} from "./product.js";

describe("product metadata", () => {
  it("defines a student-facing product name and description", () => {
    assert.equal(productName, "Guangdong Comprehensive Evaluation");
    assert.match(productDescription, /Guangdong high school students/);
  });

  it("keeps foundational student and admin navigation routes available", () => {
    assert.ok(studentNavigation.some((item) => item.href === "/"));
    assert.ok(adminNavigation.some((item) => item.href === "/admin"));
  });
});
