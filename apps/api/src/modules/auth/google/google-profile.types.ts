/** A verified Google identity — every field here has already passed id_token signature/issuer/audience/nonce validation before this shape exists. */
export interface GoogleProfile {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}
