// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { EventBrowseFilters } from "@/components/events/event-browse-filters";

const none = { category: null, neighborhood: null, dateWindow: null, price: null } as const;

afterEach(cleanup);

describe("EventBrowseFilters", () => {
  it("marks the active links with aria-current and never uses aria-pressed on a link", () => {
    const { container } = render(<EventBrowseFilters {...none} category="music" />);
    expect(screen.getByRole("link", { name: "Music" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "Any date" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "Food" }).hasAttribute("aria-current")).toBe(false);
    expect(container.querySelector("[aria-pressed]")).toBeNull();
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/events");
  });

  it("shows no Clear link when nothing is filtered", () => {
    render(<EventBrowseFilters {...none} />);
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
  });

  it("collapses Neighborhood and Price behind an accessible More filters toggle on phones", async () => {
    const user = userEvent.setup();
    render(<EventBrowseFilters {...none} />);
    const toggle = screen.getByRole("button", { name: /More filters/ });
    const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel?.classList.contains("hidden")).toBe(true);
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.classList.contains("hidden")).toBe(false);
    expect(panel?.contains(screen.getByRole("group", { name: "Price filters" }))).toBe(true);
  });

  it("keeps an applied secondary filter visible instead of hiding it behind the toggle", () => {
    render(<EventBrowseFilters {...none} price="paid" />);
    expect(screen.queryByRole("button", { name: /More filters/ })).toBeNull();
    const paid = screen.getByRole("link", { name: "Paid" });
    expect(paid.getAttribute("aria-current")).toBe("true");
    expect(paid.closest("[id]")?.classList.contains("hidden")).toBe(false);
  });

  it("keeps the other filters in each link's URL", () => {
    render(<EventBrowseFilters {...none} neighborhood="Laureles" price="paid" />);
    const href = screen.getByRole("link", { name: "Food" }).getAttribute("href") ?? "";
    expect(href).toContain("category=food");
    expect(href).toContain("neighborhood=Laureles");
    expect(href).toContain("price=paid");
    // Selecting the active chip again removes just that filter.
    const unPaid = screen.getByRole("link", { name: "Paid" }).getAttribute("href") ?? "";
    expect(unPaid).toContain("neighborhood=Laureles");
    expect(unPaid).not.toContain("price=");
  });
});
