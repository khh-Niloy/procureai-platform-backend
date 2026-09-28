# API Documentation

## Table of Contents

- [Auth](#auth)
  - [Register](#register)
  - [Register with Invitation](#register-with-invitation)
  - [Login](#login)
  - [Refresh Tokens](#refresh-tokens)
  - [Logout](#logout)
- [User](#user)
- [Organization](#organization)
- [Vendor](#vendor)
- [Purchase Request](#purchase-request)
- [Quote](#quote)
- [Document](#document)
- [App / Health](#app--health)

<details>
<summary><h2 id="auth" style="display:inline-block">Auth</h2></summary>

Authentication uses JWTs stored in HTTP-only cookies. The access cookie is named `Authentication` and is valid for 15 minutes; the refresh cookie is named `Refresh` and is valid for 7 days. Neither token is returned in the JSON response. Send requests with cookies enabled (`credentials: "include"` in browser clients).

Cookies use `SameSite=Lax` in development. In production they use `SameSite=None; Secure`. CORS is configured to accept credentials from the configured frontend origins.

### API Routes

| Method | Endpoint | Authentication | Body / Query | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/register` | None | Register body | Creates an organization and its initial procurement officer account |
| `POST` | `/auth/register-invited?token=:token` | Valid invitation token | Register invited body | Accepts an organization invitation and creates the invited account |
| `POST` | `/auth/login` | None | Login body | Authenticates an account and sets session cookies |
| `POST` | `/auth/refresh` | Refresh cookie | None | Rotates both session tokens |
| `POST` | `/auth/logout` | Access cookie | None | Revokes the stored refresh token and clears both cookies |

There is no global route prefix configured in the application.

### Cookie and session behavior

- `Authentication` contains the access JWT and is used by protected endpoints.
- `Refresh` contains the refresh JWT. It is checked against the hashed refresh token stored for the user and rotated on refresh.
- Both cookies are `HttpOnly` and use path `/`.
- Registration, invited registration, login, and refresh set both cookies using `Set-Cookie` response headers.
- Logout clears both cookies. A successful logout returns `{ "message": "Logged out successfully" }`.
- The access JWT contains `sub`, `email`, and `role`; the refresh JWT contains `sub`.

### Request schemas

#### Register body — `POST /auth/register`

| Field | Type | Required | Validation / Notes |
| --- | --- | --- | --- |
| `name` | string | Yes | Must not be empty |
| `email` | string | Yes | Must be a valid email address; must not already be registered |
| `password` | string | Yes | Minimum 6 characters |
| `organizationName` | string | Yes | Must not be empty |

The new user receives the `PROCUREMENT_OFFICER` role. The user and organization are created together.

```json
{
  "name": "Amina Rahman",
  "email": "amina@example.com",
  "password": "secure-pass-123",
  "organizationName": "Example Organization"
}
```

#### Register invited body — `POST /auth/register-invited?token=:token`

| Field | Type | Required | Validation / Notes |
| --- | --- | --- | --- |
| `name` | string | Yes | Must not be empty |
| `email` | string | Yes | Must be a valid email and match the invitation email exactly |
| `password` | string | Yes | Minimum 6 characters |

The `token` query parameter is issued through an organization invitation and expires after 72 hours. An accepted or expired invitation cannot be used. The invitation's organization and role are assigned to the new user. If the invited role is `VENDOR`, a vendor record is also created.

```http
POST /auth/register-invited?token=invitation-token
Content-Type: application/json
```

```json
{
  "name": "Sam Vendor",
  "email": "sam@example.com",
  "password": "secure-pass-123"
}
```

#### Login body — `POST /auth/login`

| Field | Type | Required | Validation / Notes |
| --- | --- | --- | --- |
| `email` | string | Yes | Must be a valid email address |
| `password` | string | Yes | Minimum 6 characters |

```json
{
  "email": "amina@example.com",
  "password": "secure-pass-123"
}
```

### Response objects

Successful registration, invited registration, and login return the user object directly. The password hash and stored refresh-token hash are excluded. The response includes the user `id`, `name`, `email`, `role`, `isActive`, `organizationId`, and `updatedAt` fields. JWTs are delivered only through cookies.

Example response body:

```json
{
  "id": "9df447d3-a22c-4738-a1cb-e13d2d672e6b",
  "name": "Amina Rahman",
  "email": "amina@example.com",
  "role": "PROCUREMENT_OFFICER",
  "isActive": true,
  "organizationId": "b05dc470-12b2-4a86-93b4-55b4cb8692cf",
  "updatedAt": "2026-09-28T10:00:00.000Z"
}
```

Successful login and refresh return HTTP `200`. Register and register-invited use Nest's default POST status, HTTP `201`.

### Error responses

Errors follow NestJS's standard exception response shape, for example:

```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

| Status | Cases |
| --- | --- |
| `400` | Request validation fails (invalid email, missing required field, or password shorter than 6 characters) |
| `401` | Login credentials are invalid; invitation token is invalid or expired; refresh cookie is invalid, expired, or revoked |
| `409` | Registration email already exists; invitation was already accepted; invited email does not match the invitation |

### Endpoint details

<details>
<summary><b>POST /auth/register</b></summary>

Creates an organization and its initial procurement officer, then sets the `Authentication` and `Refresh` cookies.

Request: [Register body](#register-body--post-authregister).

Response: User object, as shown in [Response objects](#response-objects). Status `201`.

</details>

<details>
<summary><b>POST /auth/register-invited?token=:token</b></summary>

Creates a user under the organization and role named by a valid invitation, marks the invitation accepted, and sets both session cookies.

Request: [Register invited body](#register-invited-body--post-authregister-invitedtokentoken).

Response: User object, as shown in [Response objects](#response-objects). Status `201`.

</details>

<details>
<summary><b>POST /auth/login</b></summary>

Checks the email and password, then sets both session cookies.

Request: [Login body](#login-body--post-authlogin).

Response: User object, as shown in [Response objects](#response-objects). Status `200`.

</details>

<details>
<summary><b>POST /auth/refresh</b></summary>

Requires the `Refresh` cookie. On success, rotates the access and refresh tokens and returns:

```json
{ "message": "Tokens refreshed" }
```

Status `200`. The refreshed tokens are set in cookies, not in the JSON response.

</details>

<details>
<summary><b>POST /auth/logout</b></summary>

Requires a valid `Authentication` cookie. Clears the saved refresh-token hash and both session cookies.

```json
{ "message": "Logged out successfully" }
```

Status `200`.

</details>

</details>

<details>
<summary><h2 id="user" style="display:inline-block">User</h2></summary>

All user routes require the `Authentication` cookie. The API scopes the caller through the authenticated user; user administration routes are limited to the `ADMIN` role. User responses omit password and refresh-token hashes.

| Method | Endpoint | Role | Body | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/user/profile` | Any authenticated user | None | Gets the caller's profile |
| `GET` | `/user/:id` | `ADMIN` | None | Gets a user by ID |
| `PATCH` | `/user/:id` | `ADMIN` | Update user body | Updates user properties |

`PATCH /user/:id` accepts any of these optional fields: `name` (string), `email` (valid email), `password` (string, at least 6 characters), `role` (valid role enum), and `isActive` (boolean). Roles are `TEAM_LEADER`, `MANAGER`, `PROCUREMENT_OFFICER`, `FINANCE_OFFICER`, `CFO`, `VENDOR`, and `ADMIN`.

```json
{
  "name": "Amina Rahman",
  "isActive": true
}
```

Returns the updated user directly. Missing IDs return `404 User not found`.

</details>

<details>
<summary><h2 id="organization" style="display:inline-block">Organization</h2></summary>

Organization data is taken from the authenticated user's organization. Invitation creation is available to `ADMIN` and `PROCUREMENT_OFFICER`; organization user listing is available to any authenticated organization member.

| Method | Endpoint | Role | Body | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/organization/invite` | `ADMIN`, `PROCUREMENT_OFFICER` | Array of invitation objects | Sends organization invitations |
| `GET` | `/organization/users` | Any authenticated user | None | Lists users in the caller's organization |

The invitation body is a JSON array. Each entry requires a valid `email` and `role` from the role enum listed in the [User](#user) section.

```json
[
  { "email": "sam@example.com", "role": "VENDOR" },
  { "email": "lee@example.com", "role": "MANAGER" }
]
```

Successful invitation creation returns `{ "message": "Invitations sent successfully" }` (HTTP `201`). Each invitation link expires after 72 hours and is accepted through [`POST /auth/register-invited`](#register-invited-body--post-authregister-invitedtokentoken). The users endpoint returns an array of `{ id, name, email, role, isActive, updatedAt }` objects, ordered by name.

</details>

<details>
<summary><h2 id="vendor" style="display:inline-block">Vendor</h2></summary>

All vendor routes require authentication and are scoped to the caller's organization. Vendor accounts can update their own vendor record. Vendor lookup by ID is available to any authenticated role, but only returns records from the caller's organization.

| Method | Endpoint | Role | Body / Query | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/vendors` | `PROCUREMENT_OFFICER` | None | Lists vendors in the organization, newest first |
| `GET` | `/vendors/quote-requests` | `VENDOR` | None | Lists quote requests assigned to the caller's active vendor account |
| `GET` | `/vendors/:id` | Any authenticated role | None | Gets an organization vendor by ID |
| `PATCH` | `/vendors/:id` | `VENDOR` | Update vendor body | Updates a vendor in the caller's organization |

Update fields are optional: `name` (non-empty string), `email` (valid email), `phone`, `address`, and `website` (strings). The vendor create route is not currently enabled.

```json
{
  "name": "Acme Supply",
  "email": "sales@acme.example",
  "phone": "+1-555-0100",
  "address": "10 Main Street",
  "website": "https://acme.example"
}
```

Vendor lookup returns a vendor object; list endpoints return arrays. Missing or out-of-organization vendor IDs return `404`. `/vendors/quote-requests` returns `404 Active vendor not found` if the signed-in vendor user has no active vendor record.

</details>

<details>
<summary><h2 id="purchase-request" style="display:inline-block">Purchase Request</h2></summary>

All routes require authentication and operate only on the caller's organization. Route access is role-based as listed below. Purchase request lists are returned newest first.

| Method | Endpoint | Role | Body | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/purchase-requests` | `TEAM_LEADER` | Create request body | Creates a request in `PENDING_MANAGER_APPROVAL` |
| `GET` | `/purchase-requests` | Any authenticated role | None | Lists organization requests with items, requester, analyses, and approvals |
| `GET` | `/purchase-requests/pending-initial-approval` | `MANAGER` | None | Lists requests awaiting initial manager decision |
| `GET` | `/purchase-requests/pending-quote-collection` | `PROCUREMENT_OFFICER` | None | Lists requests in `INITIAL_APPROVED` status |
| `GET` | `/purchase-requests/quote-collection` | `PROCUREMENT_OFFICER` | None | Lists requests in `QUOTE_COLLECTION` status |
| `POST` | `/purchase-requests/:id/initial-approval` | `MANAGER` | Initial decision body | Approves or rejects initial request |
| `POST` | `/purchase-requests/:id/start-quote-collection` | `PROCUREMENT_OFFICER` | None | Starts collection and creates quote requests for active vendors |
| `POST` | `/purchase-requests/:id/analyze-quotes` | `ADMIN`, `MANAGER`, `PROCUREMENT_OFFICER` | Analyze quotes body | Runs quote analysis for selected quotes |
| `POST` | `/purchase-requests/:id/analyses/:analysisId/approval` | `MANAGER`, `FINANCE_OFFICER`, `CFO` | Approval decision body | Approves or rejects an analysis at the caller's approval stage |
| `POST` | `/purchase-requests/:id/mark-purchased` | `PROCUREMENT_OFFICER` | None | Marks a CFO-approved request as purchased |

Create request fields:

| Field | Type | Required | Validation / Notes |
| --- | --- | --- | --- |
| `title` | string | Yes | Non-empty |
| `description` | string | Yes | Non-empty |
| `items` | array | Yes | Each item requires a non-empty `name` and integer `quantity` of at least 1 |
| `items[].description` | string | No | Optional item description |
| `items[].specifications` | object | No | Optional item requirements |
| `budget` | decimal string | No | Optional budget |
| `currency` | string | No | `USD`, `EUR`, `GBP`, or `BDT` |
| `requiredBy` | date string | No | ISO date/time string |

```json
{
  "title": "Office laptops",
  "description": "Purchase laptops for the engineering team",
  "budget": "5000.00",
  "currency": "USD",
  "requiredBy": "2026-11-15T00:00:00.000Z",
  "items": [
    {
      "name": "Laptop",
      "description": "Development laptop",
      "quantity": 5,
      "specifications": { "memory": "32GB" }
    }
  ]
}
```

Initial decision body accepts `status` equal to `INITIAL_APPROVED` or `REJECTED`, and optional string `comment` up to 2,000 characters. Analysis body requires a non-empty `quoteIds` array of UUID v4 values. Approval decision body accepts `status` equal to `APPROVED` or `REJECTED`, and optional `comment` up to 2,000 characters.

On successful analysis, the response includes `purchaseRequestStatus` and an `analysis` object with status, selected quote IDs, recommendation, hard rule results, recommended quote ID, approvals, failure reason, and completion/creation timestamps. Approval transitions are manager → finance officer → CFO. Only a CFO-approved request can be marked purchased. Invalid state transitions return `409`; requests outside the organization or missing resources return `404`; invalid quote selection returns `400`.

</details>

<details>
<summary><h2 id="quote" style="display:inline-block">Quote</h2></summary>

All quote routes require authentication and the `VENDOR` role. A vendor may access only their own quotes within their organization.

| Method | Endpoint | Role | Body | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/quotes` | `VENDOR` | Create quote body | Submits a quote and queues PDF generation |
| `GET` | `/quotes/mine` | `VENDOR` | None | Lists the caller's quotes and latest quote documents |
| `GET` | `/quotes/:id/document/download-url` | `VENDOR` | None | Returns a signed URL for the generated quote PDF |
| `POST` | `/quotes/:id/document/retry` | `VENDOR` | None | Requeues PDF generation when the latest PDF failed |

Create quote fields include required UUID `purchaseRequestId`, decimal string `totalAmount`, `currency` (`USD`, `EUR`, `GBP`, or `BDT`), and an `items` array. Each quote item requires `productName`, decimal string `quantity`, `unitPrice`, and `totalPrice`. Optional totals (`subtotal`, `discount`, `tax`, `shippingCost`) are decimal strings; optional delivery/warranty/validity day or month counts are non-negative integers. Optional text fields are `deliveryTerms`, `paymentTerms`, `notes`, and item `description`/`unit`; item `specifications` may be an object.

```json
{
  "purchaseRequestId": "9df447d3-a22c-4738-a1cb-e13d2d672e6b",
  "subtotal": "4500.00",
  "totalAmount": "4500.00",
  "currency": "USD",
  "deliveryDays": 14,
  "items": [
    {
      "productName": "Laptop",
      "quantity": "5",
      "unitPrice": "900.00",
      "totalPrice": "4500.00",
      "unit": "each"
    }
  ]
}
```

Quote submission returns the quote with its items and a `document` object (`id`, `status`, `fileName`). The PDF is generated asynchronously; if queueing fails, the quote has already been saved and the endpoint returns `503`. Download URL returns `{ "fileName": "...", "url": "..." }` once the document is ready; processing or failed documents return `409`. Retry returns `{ "documentId": "...", "status": "PROCESSING", "message": "Quotation PDF retry has been queued." }` and is allowed only for a failed document.

</details>

<details>
<summary><h2 id="document" style="display:inline-block">Document</h2></summary>

Document listing requires authentication and the `PROCUREMENT_OFFICER` role. The endpoint requires a vendor ID query parameter and returns the vendor's quote document summaries for the caller's organization.

| Method | Endpoint | Role | Query | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/documents?vendorId=:vendorId` | `PROCUREMENT_OFFICER` | `vendorId` required | Lists a vendor's documents newest first |

Example:

```http
GET /documents?vendorId=9df447d3-a22c-4738-a1cb-e13d2d672e6b
```

Returns an array of objects containing `quoteId`, `organizationId`, `vendorId`, and `fileName`. Missing `vendorId` returns `400`; a vendor outside the organization or an unknown vendor returns `404`.

</details>

<details>
<summary><h2 id="app--health" style="display:inline-block">App / Health</h2></summary>

| Method | Endpoint | Authentication | Description |
| --- | --- | --- | --- |
| `GET` | `/` | None | Returns the plain text `Hello World!` |

This is the application's root route; no dedicated health-check route is currently defined.

</details>


