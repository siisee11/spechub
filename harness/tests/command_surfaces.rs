use harnesscli::lint::Severity;

#[test]
fn severity_string_values_are_stable() {
    assert_eq!(Severity::Warn.as_str(), "warn");
    assert_eq!(Severity::Error.as_str(), "error");
}
