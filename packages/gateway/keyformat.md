# Gateway root key format details

For every Gateway deployment a set of root access keys must be provided, comprising a secret (auth) key and a public/private key pair, as follows.

| Setting                     | Format                                                                                   |
|-----------------------------|------------------------------------------------------------------------------------------|
| TIMELD_GATEWAY_AUTH__KEY    | `≪appid≫.≪keyid≫:≪secret≫`                                                               |
| TIMELD_GATEWAY_KEY__PUBLIC  | base-64 + DER encoded SPKI RSA public key                                                |
| TIMELD_GATEWAY_KEY__PRIVATE | base-64 + DER encoded PKCS8 RSA private key, encrypted with `aes-256-cbc` and `≪secret≫` |

Where:
- `≪appid≫` is some application identifier (e.g. `timeld`; unused, for future multi-app support)
- `≪keyid≫` is the key identifier (at least 5 characters), used for logging (e.g. `rootkey`)
- `≪secret≫` is the secret key material (minimum 20 characters, e.g. `123456789abcdefghijk`)

**NB** there is a "`.`" between the `≪appid≫` and the `≪keyid≫`, but a "`:`" (*colon*) between the `≪keyid≫` and the `≪secret≫`.
