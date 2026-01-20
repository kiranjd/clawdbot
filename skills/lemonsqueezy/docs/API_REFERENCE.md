# LemonSqueezy API Reference

Scraped: 2026-01-20

## Overview

- **Base URL:** `https://api.lemonsqueezy.com/v1`
- **Format:** REST API with JSON:API responses
- **Rate Limit:** 300 calls/minute
- **Headers:** `X-Ratelimit-Limit`, `X-Ratelimit-Remaining`
- **Auth:** Bearer token via `Authorization` header

## Authentication

```bash
curl -s 'https://api.lemonsqueezy.com/v1/...' \
  -H "Authorization: Bearer $LEMONSQUEEZY_API_KEY" \
  -H "Accept: application/vnd.api+json"
```

---

## Resources & Endpoints

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users` | Retrieve authenticated user |

**User Object:**
- `name`, `email` - Account info
- `color` - Hex avatar background
- `avatar_url` - Profile image
- `has_custom_avatar` - Boolean
- `createdAt`, `updatedAt` - Timestamps

---

### Stores
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stores/{id}` | Retrieve store |
| GET | `/stores` | List all stores |

**Store Object:**
- `name`, `slug`, `domain`, `url`, `avatar_url` - Identity
- `plan` - Subscription tier (fresh, sweet, etc.)
- `country`, `country_nicename`, `currency` - Location/billing
- `total_sales`, `total_revenue` - All-time metrics (revenue in USD cents)
- `thirty_day_sales`, `thirty_day_revenue` - 30-day metrics

---

### Customers
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/customers` | Create customer |
| GET | `/customers/{id}` | Retrieve customer |
| PATCH | `/customers/{id}` | Update customer |
| GET | `/customers` | List all customers |

**Customer Object:**
- `store_id` - Associated store
- `name`, `email` - Contact info
- `city`, `region`, `country`, `country_formatted` - Location
- `status` - Email marketing: subscribed, unsubscribed, archived, requires_verification, invalid_email, bounced
- `total_revenue_currency` - Lifetime revenue (USD cents)
- `mrr` - Monthly recurring revenue (USD cents)
- `urls.customer_portal` - 24h pre-signed portal URL

---

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/products/{id}` | Retrieve product |
| GET | `/products` | List all products |

**Product Object:**
- `store_id`, `name`, `slug`, `description` - Identity
- `status` - draft or published
- `thumb_url`, `large_thumb_url` - Images (100x100, 1000x1000)
- `price`, `price_formatted` - Single price (cents)
- `from_price`, `to_price` - Variant price range
- `pay_what_you_want` - Boolean
- `buy_now_url` - Direct checkout link
- `test_mode` - Boolean

---

### Variants
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/variants/{id}` | Retrieve variant |
| GET | `/variants` | List all variants |

**Variant Object:**
- `product_id`, `name`, `slug`, `description` - Identity
- `sort` - Display order
- `status` - pending, draft, published
- `has_license_keys` - Boolean
- `license_activation_limit` - Max activations
- `is_license_limit_unlimited` - Boolean
- `license_length_value`, `license_length_unit` - Expiration (days/months/years)
- `is_license_length_unlimited` - Boolean
- `links` - Array of {title, url} objects

**Deprecated Pricing (use Price objects):**
- `price`, `is_subscription`, `interval`, `interval_count`
- `has_free_trial`, `trial_interval`, `trial_interval_count`
- `pay_what_you_want`, `min_price`, `suggested_price`

---

### Prices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/prices/{id}` | Retrieve price |
| GET | `/prices` | List all prices |

---

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/orders/{id}` | Retrieve order |
| GET | `/orders` | List all orders |
| POST | `/orders/{id}/invoices` | Generate invoice |
| POST | `/orders/{id}/refunds` | Issue refund |

**Order Object:**
- `store_id`, `customer_id` - References
- `identifier` - UUID
- `order_number` - Sequential per store
- `user_name`, `user_email` - Customer info
- `currency`, `currency_rate` - ISO 4217 code + USD conversion
- `subtotal`, `setup_fee`, `discount_total`, `tax`, `total` - Amounts (cents)
- `*_usd` variants - USD equivalents
- `*_formatted` variants - Human readable ($9.99)
- `tax_name`, `tax_rate`, `tax_inclusive` - Tax info
- `status` - pending, failed, paid, refunded, partial_refund, fraudulent
- `refunded`, `refunded_at` - Refund status
- `first_order_item` - Embedded object
- `urls.receipt` - Pre-signed URL
- `test_mode` - Boolean

**Filters:**
- `filter[status]` - pending, paid, refunded
- `filter[user_email]` - Customer email
- `filter[refunded]` - true/false

---

### Order Items
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/order-items/{id}` | Retrieve item |
| GET | `/order-items` | List all items |

**Order Item Object:**
- `order_id`, `product_id`, `variant_id` - References
- `product_name`, `variant_name` - Display names
- `price` - Cost in cents
- `quantity` - Item count

---

### Subscriptions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/subscriptions/{id}` | Retrieve subscription |
| PATCH | `/subscriptions/{id}` | Update subscription |
| GET | `/subscriptions` | List subscriptions |
| DELETE | `/subscriptions/{id}` | Cancel subscription |

**Subscription Object:**
- `store_id`, `customer_id`, `order_id`, `order_item_id`, `product_id`, `variant_id` - References
- `user_name`, `user_email` - Customer info
- `product_name`, `variant_name` - Product info
- `card_brand` - visa, mastercard, amex, discover, jcb, diners, unionpay
- `card_last_four` - Last 4 digits
- `payment_processor` - stripe or paypal

**Status Values:**
| Status | Description |
|--------|-------------|
| `on_trial` | Active free trial |
| `active` | Current, paying subscription |
| `paused` | Payment collection paused |
| `past_due` | Renewal failed, 4 retry attempts |
| `unpaid` | Payment recovery failed |
| `cancelled` | Future payments cancelled, grace period active |
| `expired` | Subscription ended |

**Management Fields:**
- `billing_anchor` - Day of month (1-31)
- `renews_at` - Next billing date
- `trial_ends_at` - Trial end date
- `ends_at` - Expiration date (cancelled/expired)
- `pause` - Object with `mode` (void/free) and `resumes_at`
- `cancelled` - Boolean

**URLs:**
- `update_payment_method` - Payment details (24h)
- `customer_portal` - Full management (24h)
- `customer_portal_update_subscription` - Upgrade/downgrade (PayPal only)

---

### Subscription Invoices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/subscription-invoices/{id}` | Retrieve invoice |
| GET | `/subscription-invoices` | List invoices |
| POST | `/subscription-invoices` | Generate invoice |
| POST | `/subscription-invoices/{id}/refunds` | Issue refund |

**Invoice Object:**
- `store_id`, `subscription_id`, `customer_id` - References
- `user_name`, `user_email` - Customer info
- `billing_reason` - initial, renewal, updated
- `card_brand`, `card_last_four` - Payment info
- `status` - pending, paid, void, refunded, partial_refund
- `subtotal`, `discount_total`, `tax`, `total`, `refunded_amount` - Amounts
- `urls.invoice_url` - Signed PDF download

---

### License Keys
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/license-keys/{id}` | Retrieve key |
| PATCH | `/license-keys/{id}` | Update key |
| GET | `/license-keys` | List keys |

**License Key Object:**
- `store_id`, `customer_id`, `order_id`, `order_item_id`, `product_id` - References
- `user_name`, `user_email` - Customer info
- `key` - Full UUID license key
- `key_short` - Abbreviated (XXXX-...last12)
- `activation_limit` - Max activations
- `instances_count` - Current count
- `disabled` - Boolean
- `status` - inactive, active, expired, disabled
- `expires_at` - Expiration (null for perpetual)

---

### License API (Customer-facing)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/licenses/activate` | Activate license on device |
| POST | `/licenses/deactivate` | Deactivate license |
| POST | `/licenses/validate` | Verify license status |

---

### License Key Instances
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/license-key-instances/{id}` | Retrieve instance |
| GET | `/license-key-instances` | List instances |

---

### Discounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/discounts` | Create discount |
| GET | `/discounts/{id}` | Retrieve discount |
| DELETE | `/discounts/{id}` | Delete discount |
| GET | `/discounts` | List discounts |

**Discount Object:**
- `store_id`, `name` - Identity
- `code` - Alphanumeric (3-256 chars, uppercase)
- `amount` - Value in cents or percentage
- `amount_type` - percent or fixed
- `is_limited_to_products` - Boolean
- `is_limited_redemptions` - Boolean
- `max_redemptions` - Max uses
- `starts_at`, `expires_at` - Validity period
- `duration` - once, repeating, forever (subscriptions)
- `duration_in_months` - For repeating
- `status` - draft, published

---

### Discount Redemptions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/discount-redemptions/{id}` | Retrieve redemption |
| GET | `/discount-redemptions` | List redemptions |

---

### Checkouts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/checkouts` | Create checkout |
| GET | `/checkouts/{id}` | Retrieve checkout |
| GET | `/checkouts` | List checkouts |

**Checkout Object:**
- `store_id`, `variant_id` - References
- `product_options` - Override name, description, media, redirect URLs
- `checkout_options` - UI controls (media visibility, colors)
- `checkout_data` - Pre-fill email, name, address, discount codes
- `enabled_variants` - Which variants to show
- `preview` - If true, returns pricing calculations
- `url` - Signed checkout URL
- `expires_at` - ISO 8601 (null for perpetual)

---

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks` | Create webhook |
| GET | `/webhooks/{id}` | Retrieve webhook |
| PATCH | `/webhooks/{id}` | Update webhook |
| DELETE | `/webhooks/{id}` | Delete webhook |
| GET | `/webhooks` | List webhooks |

**Webhook Object:**
- `store_id` - Associated store
- `url` - Callback URL
- `events` - Array of event types
- `last_sent_at` - Last transmission
- `test_mode` - Boolean

---

## Webhook Events

| Event | Payload | Description |
|-------|---------|-------------|
| `order_created` | Order | New order placed |
| `order_refunded` | Order | Full/partial refund |
| `subscription_created` | Subscription | Subscription started |
| `subscription_updated` | Subscription | Any modification |
| `subscription_cancelled` | Subscription | Cancellation (grace period) |
| `subscription_resumed` | Subscription | Reactivated |
| `subscription_expired` | Subscription | Ended |
| `subscription_paused` | Subscription | Payment collection paused |
| `subscription_unpaused` | Subscription | Resumed from pause |
| `subscription_payment_success` | Invoice | Successful renewal |
| `subscription_payment_failed` | Invoice | Failed renewal |
| `subscription_payment_recovered` | Invoice | Success after failure |
| `subscription_payment_refunded` | Invoice | Payment refunded |
| `license_key_created` | License Key | New key generated |
| `license_key_updated` | License Key | Key modified |
| `affiliate_activated` | Affiliate | Affiliate activated |

**Recommended minimum:** `order_created`, `subscription_created`, `subscription_payment_success`, `subscription_updated`

---

## Webhook Signature Verification

**Algorithm:** HMAC-SHA256
**Header:** `X-Signature`
**Secret:** 6-40 character signing secret

```javascript
import crypto from "node:crypto";

const secret = 'SIGNING_SECRET';
const hmac = crypto.createHmac('sha256', secret);
const digest = Buffer.from(hmac.update(request.rawBody).digest('hex'), 'utf8');
const signature = Buffer.from(request.get('X-Signature') || '', 'utf8');

if (!crypto.timingSafeEqual(digest, signature)) {
    throw new Error('Invalid signature.');
}
```

---

## SDKs

**Official:**
- JavaScript: `@lmsqueezy/lemonsqueezy.js`
- Laravel: `@lmsqueezy/laravel`

**Community:** Go, Ruby, Rust, Swift, Python, PHP, Elixir, Java
