const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function digest(value: string) {
  return bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
  );
}

export async function preparePrivateInvoice(input: {
  invoiceId: string;
  faceValue: string;
  maturity: string;
  debtorCountry: string;
}) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const canonical = [
    input.invoiceId.trim().toLowerCase(),
    input.faceValue,
    input.maturity,
    input.debtorCountry.toUpperCase(),
  ].join("|");
  return {
    commitment: await digest(`${canonical}|${salt}`),
    nullifier: await digest(`coven:nullifier:${input.invoiceId.trim().toLowerCase()}`),
    salt,
  };
}

