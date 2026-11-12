export interface AuthMethodsDto {
  google: boolean;
  phone: boolean;
  password: boolean;
  /** False when admins have closed new password sign-ups (auth.passwordSignupEnabled). Missing = open. */
  passwordSignup?: boolean;
}
