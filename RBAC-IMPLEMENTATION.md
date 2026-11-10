# RBAC and Customer Management – revised implementation

## Roles
- `admin`: full access to operational orders, all progress, customer records, user administration, account activation, and system administration endpoints currently implemented.
- `staff`: operational access to customer lookup/create, all orders, order creation, and status/payment updates.
- `customer`: read-only access to orders associated with the authenticated account's linked customer profile (or legacy `orders.user_id`).

## Customer data model
- `customers` stores customer identity independently from login accounts.
- `users.customer_id` optionally links a login account to a customer record.
- `orders.customer_id` links each new order to a customer record.
- Guest customers can be created by Admin/Staff during order entry and do not receive login credentials.
- Existing orders are preserved; their new `customer_id` remains NULL until manually reconciled.

## Endpoints
| Endpoint | Access |
|---|---|
| `GET /api/customers?q=...` | Admin, Staff |
| `GET /api/customers/all` | Admin, Staff |
| `POST /api/customers` | Admin, Staff |
| `GET /api/orders` | Admin/Staff: all; Customer: own linked orders |
| `POST /api/orders` | Admin, Staff |
| `PUT /api/orders/:id/status` | Admin, Staff |
| `GET/POST /api/admin/users` | Admin |
| `PATCH /api/admin/users/:id/active` | Admin |

## Migration behavior
On backend startup, additive migrations create `customers` and add nullable
`customer_id` columns/foreign keys to `users` and `orders` when absent.
Existing rows are retained. Existing orders are not automatically assigned
to a customer because reliable matching cannot be inferred safely.

## Important limitation
A Guest Customer cannot view progress until an account is securely linked to that customer record. This revision does not implement OTP-based guest-account claiming. Do not link accounts based only on a matching name or an unverified phone number.

## Apply
Back up the MariaDB volume before deployment. Then:
```powershell
docker compose up -d --build backend frontend
docker compose ps
docker compose logs backend --tail 50
```
