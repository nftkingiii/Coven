fn main(
    invoice_value: u64,
    days_to_maturity: u32,
    invoice_id: Field,
    salt: Field,
    max_invoice_value: pub Field,
    max_days_to_maturity: pub Field,
) -> pub [Field; 2] {
    let value_limit = max_invoice_value as u64;
    let maturity_limit = max_days_to_maturity as u32;

    assert(invoice_value <= value_limit);
    assert(days_to_maturity <= maturity_limit);
    assert(invoice_id != 0);
    assert(salt != 0);

    let commitment = std::hash::pedersen_hash([
        1,
        invoice_id,
        invoice_value as Field,
        days_to_maturity as Field,
        salt,
    ]);
    let nullifier = std::hash::pedersen_hash([2, invoice_id]);

    [commitment, nullifier]
}
