// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { LoginPage } from "./LoginPage";

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LoginPage />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

async function fill(user: ReturnType<typeof userEvent.setup>, email = "a@crown.example", password = "wrong password") {
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
}

const fetchMock = vi.fn();

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoginPage", () => {
  it("signs in with email and password as JSON", async () => {
    fetchMock.mockResolvedValue(json(200, { id: "1", email: "a@crown.example", full_name: "A", roles: [], permissions: [] }));
    const user = setup();
    await fill(user, "a@crown.example", "a long enough password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({ email: "a@crown.example", password: "a long enough password" });
  });

  it("wrong password: says so, marks the field, keeps what was typed", async () => {
    fetchMock.mockResolvedValue(json(401, { error: "invalid_credentials" }));
    const user = setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is wrong.");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveValue("a@crown.example");
    expect(screen.getByLabelText("Password")).toHaveValue("wrong password");
  });

  it("shows busy state and blocks a second submit while waiting", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (finish = r)));
    const user = setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const busy = await screen.findByRole("button", { name: "Signing in…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(json(401, { error: "invalid_credentials" }));
    await screen.findByRole("alert");
  });

  it("locked: tells how many minutes and disables the button", async () => {
    fetchMock.mockResolvedValue(json(429, { error: "too_many_attempts" }, { "Retry-After": "840" }));
    const user = setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 14 minutes");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("no connection: says so and keeps what was typed", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No connection to the server.");
    expect(screen.getByLabelText("Password")).toHaveValue("wrong password");
  });

  it("show password toggles the field type", async () => {
    const user = setup();
    const field = screen.getByLabelText("Password");
    expect(field).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(field).toHaveAttribute("type", "password");
  });

  it("switches to Amharic: text, document language and the Ethiopian date", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "አማርኛ" }));

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("ይግቡ");
    expect(screen.getByLabelText("ኢሜይል")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("am");
    expect(screen.getAllByText(/ዓ\.ም\./).length).toBeGreaterThan(0);
  });

  it("Amharic error messages", async () => {
    await i18n.changeLanguage("am");
    fetchMock.mockResolvedValue(json(401, { error: "invalid_credentials" }));
    const user = setup();
    await user.type(screen.getByLabelText("ኢሜይል"), "a@crown.example");
    await user.type(screen.getByLabelText("የይለፍ ቃል"), "wrong password");
    await user.click(screen.getByRole("button", { name: "ይግቡ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም።");
  });

  it("every field has a label and the form has one primary action", () => {
    setup();
    expect(screen.getByLabelText("Email")).toBeRequired();
    expect(screen.getByLabelText("Password")).toBeRequired();
    expect(screen.getAllByRole("button", { name: "Sign in" })).toHaveLength(1);
  });
});
