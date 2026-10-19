import { test, expect } from "@playwright/test";
import { adminLogin, jpegUpload, openFirstPlant, requireE2ECreds } from "./helpers.js";

test.describe("Disease analysis system flow", () => {
  test("login screen loads when the app is up", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Admin Login/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("admin can open Disease Diagnostics and run analysis", async ({ page }) => {
    requireE2ECreds(test);

    await adminLogin(page);
    await openFirstPlant(page);

    await page.getByRole("button", { name: "Analyse Disease" }).click();
    await expect(page.getByRole("heading", { name: /Disease Diagnostics/ })).toBeVisible();

    await page.locator("#leafImageInput").setInputFiles(jpegUpload("leaf.jpg"));
    await expect(page.getByAltText("Selected Leaf")).toBeVisible();

    await page.getByRole("button", { name: "Run Disease Analysis" }).click();

    await expect(page.getByText("Diagnostic Verdict & Results")).toBeVisible({
      timeout: 120_000,
    });
    await expect(
      page.getByRole("heading", { name: /Last 7 days \(\d+ readings\)/i })
    ).toBeVisible();
  });
});
