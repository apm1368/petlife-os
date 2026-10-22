export interface AuthMethodsDto {
  /** Code-only sign-in by mobile — a test fixture, off on every real deployment. */
  phone: boolean;
  /** Username + password, confirmed with an SMS code. */
  password: boolean;
}
