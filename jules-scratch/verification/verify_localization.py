from playwright.sync_api import sync_playwright, expect
import os

def run(playwright):
    # Create directory if it doesn't exist
    output_dir = "jules-scratch/verification"
    os.makedirs(output_dir, exist_ok=True)

    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:5775")

        # Wait for the main content to load by looking for the header
        expect(page.get_by_text("AIニュース収集ツール")).to_be_visible(timeout=10000)

        # Take a screenshot
        screenshot_path = os.path.join(output_dir, "verification.png")
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        # Assertions to verify content
        expect(page.get_by_text("収集日時を選択")).to_be_visible()
        expect(page.get_by_text("キーワード")).to_be_visible()
        expect(page.get_by_text("収集数")).to_be_visible()
        expect(page.get_by_text("ユニーク数")).to_be_visible()
        expect(page.get_by_text("重複数")).to_be_visible()

        # Check for a button
        read_article_button = page.get_by_role("link", name="記事を読む")
        expect(read_article_button.first).to_be_visible()

        print("Verification successful!")

    except Exception as e:
        print(f"An error occurred: {e}")
        error_screenshot_path = os.path.join(output_dir, "error.png")
        page.screenshot(path=error_screenshot_path)
        print(f"Error screenshot saved to {error_screenshot_path}")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)