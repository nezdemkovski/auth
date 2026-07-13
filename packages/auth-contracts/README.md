# Auth contracts

Framework-independent business contracts for platform-owned resources such as
billing and media. The parsers accept `unknown` so consumers do not have to
trust remote JSON.

This package intentionally contains no Better Auth session, OAuth token, user,
or error response models. Consumers use Better Auth's inferred types for
protocol data.
