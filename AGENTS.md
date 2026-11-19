# Agent instructions

Active Directory Web is an ASP.NET Core app (`net10.0-windows`) for managing Active Directory DNS records and users. The UI follows [Web_Bergdahl_Template](https://github.com/jonnybergdahl/Web_Bergdahl_Template): keep its shell, look and conventions, described below, and put features inside them.

## Projects

| Project | Purpose |
| --- | --- |
| `src/Bergdahl.ActiveDirectory.Core` | `DnsWmiService` (DNS over WMI, `root\MicrosoftDNS`), `UserManagementService` (`System.DirectoryServices.AccountManagement`), models. |
| `src/Bergdahl.ActiveDirectory.Mock` | In-memory versions of both services. `DEBUG` builds use them, and the login then accepts any user name. |
| `src/Bergdahl.ActiveDirectory.Web` | Controllers (`/api/...`), Razor views and `wwwroot`. |
| `src/Bergdahl.ActiveDirectory.Tests` | xUnit tests, mostly against the mocks. |

Build and test on Windows with the .NET 10 SDK.

## How this app differs from the template

- **Pages are Razor views**, not `<section class="page">` blocks in one `index.html`. `Views/Shared/_Layout.cshtml` holds the shell (top bar, left menu, footer, the shared confirm dialog); each view in `Views/Home` is one page and sets `ViewData["Title"]` (its `<h1>`, also used in the tab title) and `ViewData["ActivePage"]` (marks the menu entry with `aria-current="page"` on the server).
- **No hash router.** `js/app.js` is the template's file without the page switching: it only handles the mobile drawer and dropdown menus.
- **Real sign-in.** `login.html` is the template's login card; `js/login.js` posts to `/api/auth/login`, which checks the credentials against Active Directory. There is no `js/auth.js`. The server protects every page and API (`[Authorize]`); unauthenticated requests go to `/login.html`.
- **CSRF.** State-changing `/api` calls need the `X-XSRF-TOKEN` header. The layout renders the token in `<meta name="csrf-token">`; always call the API through `api()` in `js/site.js`, which adds it and handles 401.
- **Search** (`js/search.js`) keeps the template's field, keys and phone mode, but `search()` looks up hosts in every configured DNS zone and users in every configured OU (fetched from the API on first use). A result opens its page with `?zone=…&q=…` or `?path=…&q=…`, which the page scripts read to preselect the zone/OU and filter.
- **Account page** is `/account` (`Views/Home/Account.cshtml`), reached from the account menu.

## Files in `src/Bergdahl.ActiveDirectory.Web`

| Path | Purpose |
| --- | --- |
| `Views/Shared/_Layout.cshtml` | The shell from the template, the app name (`AppName`), the shared confirm dialog and the toast container. |
| `Views/Home/Index.cshtml` + `wwwroot/js/dns.js` | DNS records page. |
| `Views/Home/Users.cshtml` + `wwwroot/js/users.js` | Users page, with the change-password and groups dialogs. |
| `Views/Home/Account.cshtml` | Account page. |
| `wwwroot/login.html`, `wwwroot/js/login.js` | Sign-in screen. |
| `wwwroot/css/theme.css`, `wwwroot/css/app.css`, `wwwroot/js/theme.js` | Copied unchanged from the template. Update them by copying again, not by editing here. |
| `wwwroot/css/site.css` | App components the template doesn't have: toolbar, dialogs (`<dialog class="dialog">`), toasts, sortable table headers, row actions, chips, `.button.danger`, `.form-grid.cols-2`. Tokens only. |
| `wwwroot/js/site.js` | Shared helpers: `el()`, `icon()`, `iconButton()`, `api()`, `showStatus()` (toasts), `openDialog()`/`closeDialog()`, `confirmAction()`, `sortRows()`/`initSortHeaders()`, `emptyRow()`, logout. |
| `wwwroot/assets/app-icon.svg` | The app icon: a white directory tree on brand blue. |
| `wwwroot/assets/favicon.svg` | Favicon from the template. |

`wwwroot/images/ADCentral*.png` is an older logo and is not used in the UI.

## Building page content

- Build table rows and lists with `el()`/`iconButton()` (DOM nodes and `textContent`), never by concatenating HTML strings. Names from AD and DNS are data.
- Page scripts are classic scripts loaded with `defer` from the view's `Scripts` section, after `site.js`.
- Confirm destructive actions with `confirmAction()`. Show results with `showStatus(message)` and errors with `showStatus(message, true)`.

## Layout rules (from the template)

- **Top bar**: app icon and name on the left (linking to `/`), search exactly centred (max 520px), action icons on the right in the order app icons, theme toggle, account menu. Every icon button has an `aria-label` and a `title`. Nothing else goes in the centre.
- **Left menu**: `<li><a class="nav-link" href="/path"><span class="icon">icon_name</span>Label</a></li>`. Short labels. Add `aria-current="@Current("Name")"` and set the same name as `ViewData["ActivePage"]` in the view.
- **Page**: starts with `<header class="page-header">` holding an `<h1>` and an optional one-line `<p>`.
- **Account menu**: user name, **Account**, **Logout** (always last).
- **Footer**: one line, `<app name>, Copyright© <year>, Jonny Bergdahl, GitHub`. Nothing else.
- Below 800px the menu becomes a drawer opened with the menu button. Keep that button.

## Forms

- Fields: `<label class="field"><span>Label</span><input …></label>`, with `<small class="field-hint">` for help. Every control has a visible label; placeholders are not labels.
- Selects are wrapped in `<span class="select">`.
- Layout with `.form-grid` (or `.form-grid.cols-2` for pairs) and `.form-stack`; end a form card with `.form-actions`.
- One primary `.button` per view (and per dialog). Other actions use `.button.secondary` or `.icon-button`. `.button.danger` is only for the confirm button of a destructive action.

## Theme rules

- Colours come only from the variables in `css/theme.css`. Never hard-code colours in components or inline styles.
- A new token goes in all three places in `theme.css` (light `:root`, the `prefers-color-scheme: dark` block, `:root[data-theme="dark"]`), and the two dark blocks stay identical. Since `theme.css` is the template's file, add new tokens to the template first.
- Check every change in both light and dark.

## Icons

- [Material Symbols Outlined](https://fonts.google.com/icons) only, as `<span class="icon">icon_name</span>`. No emoji, image icons or other sets.
- Outlined by default; filled only for the active menu entry (handled by `app.css`).
- A button with only an icon needs an `aria-label`.

## Logo and brand colours

- The UI identifies the app by its own icon and name (top bar and login card). The Bergdahl logo is not used in the UI.
- Brand colours: grey `#838281`, blue `#0093dd`. Blue is the only accent: active state, primary buttons, links. Primary buttons use the exact logo blue (`--color-primary`), with white text in light mode and dark text in dark mode; keep their labels short.

## Design principles

- Clean and quiet: lots of whitespace, few borders, no gradients. Shadows only for overlays (drawer, dropdowns, dialogs, toasts).
- Group content in `.card` elements. A card may start with a `.card-header` strip (icon + `<h2>`); within one page, give every card a header or none.
- Tables: `<div class="table-wrap"><table class="table">…</table></div>`, number columns with `class="num"`.
- Use the spacing (`--space-1` to `--space-6`) and radius tokens. Short transitions (`--transition`) that respect `prefers-reduced-motion`.

## Accessibility

- Real `<button>` and `<a>` elements, never clickable `<div>`s or `<span>`s.
- Keep visible focus outlines.
- WCAG AA text contrast in both themes.
- Usable at 375px wide with no horizontal page scrolling (wide tables scroll inside `.table-wrap`).
