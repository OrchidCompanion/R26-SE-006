import { expect } from "@playwright/test";
import { Buffer } from "node:buffer";

/** Valid 80x80 JPEG so Pillow on the VPS can decode the upload. */
export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCABQAFADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlKKKK/Ij+dwooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==",
  "base64"
);

export function jpegUpload(name = "leaf.jpg") {
  return { name, mimeType: "image/jpeg", buffer: TINY_JPEG };
}

export function requireE2ECreds(test) {
  test.skip(
    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
    "Set E2E_EMAIL and E2E_PASSWORD to run the full flow"
  );
}

export async function adminLogin(page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeEnabled({
    timeout: 40_000,
  });
  await page.getByPlaceholder("email@sample.com").fill(process.env.E2E_EMAIL);
  await page.getByPlaceholder("********").fill(process.env.E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText(/Welcome,/)).toBeVisible({ timeout: 30_000 });
}

export async function openFirstPlant(page) {
  await expect(page.getByText("View More").first()).toBeVisible({ timeout: 60_000 });

  const preferredUser = process.env.E2E_USER_NAME;
  const userNames = preferredUser
    ? [preferredUser]
    : (await page.locator("h3.font-bold").allTextContents()).map((n) => n.trim()).filter(Boolean);

  let foundPlant = false;
  for (const name of userNames) {
    await page.getByRole("heading", { level: 3, name }).click();
    await expect(page.getByRole("button", { name: /Back to Dashboard/ })).toBeVisible({
      timeout: 20_000,
    });

    const plantCard = page.locator("h5").first();
    const emptyState = page.getByText(
      /No Location Zones Created Yet|No orchids registered in this zone/
    );
    await expect(plantCard.or(emptyState)).toBeVisible({ timeout: 45_000 });
    if (await plantCard.isVisible()) {
      foundPlant = true;
      break;
    }

    await page.getByRole("button", { name: "Back to Dashboard" }).click();
    await expect(page.getByText("View More").first()).toBeVisible({ timeout: 60_000 });
  }

  if (!foundPlant) {
    throw new Error("No registered user has plants to analyse");
  }

  const plantName = process.env.E2E_PLANT_NAME;
  if (plantName) {
    await page.getByText(plantName, { exact: false }).first().click();
  } else {
    await page.locator("h5").first().click();
  }
}
