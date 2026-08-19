use axum::http::HeaderMap;

pub fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|header| {
            let (scheme, rest) = header.split_once(char::is_whitespace)?;
            scheme.eq_ignore_ascii_case("bearer").then_some(rest.trim())
        })
        .filter(|token| !token.is_empty())
}

pub fn tokens_equal(expected: &str, provided: &str) -> bool {
    if expected.is_empty() || expected.len() != provided.len() {
        return false;
    }
    expected
        .bytes()
        .zip(provided.bytes())
        .fold(0u8, |acc, (left, right)| acc | (left ^ right))
        == 0
}

pub fn is_authorized(expected: &str, headers: &HeaderMap) -> bool {
    bearer_token(headers).is_some_and(|provided| tokens_equal(expected, provided))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn headers_with(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            HeaderValue::from_str(value).unwrap(),
        );
        headers
    }

    #[test]
    fn rejects_missing_and_empty_tokens() {
        assert!(!is_authorized("secret", &HeaderMap::new()));
        assert!(!is_authorized("secret", &headers_with("Bearer ")));
        assert!(!is_authorized("", &headers_with("Bearer secret")));
    }

    #[test]
    fn accepts_matching_bearer_token() {
        assert!(is_authorized("secret", &headers_with("Bearer secret")));
        assert!(is_authorized("secret", &headers_with("bearer secret")));
        assert!(!is_authorized("secret", &headers_with("Bearer other")));
        assert!(!is_authorized("secret", &headers_with("secret")));
    }
}
