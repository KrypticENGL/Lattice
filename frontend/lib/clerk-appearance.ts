/**
 * Shared Clerk theme, applied globally via <ClerkProvider appearance={clerkAppearance}>.
 * Drives the Sign in / Sign up modal and the UserButton popover so both match the
 * site's pale Gruvbox palette instead of Clerk's default look.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--gruvfg)",
    colorPrimaryForeground: "var(--gruvbg)",
    colorBackground: "var(--gruvbg-1)",
    colorForeground: "var(--gruvfg)",
    colorMuted: "var(--gruvbg-2)",
    colorMutedForeground: "var(--gruvfg-3)",
    colorInput: "var(--gruvbg)",
    colorInputForeground: "var(--gruvfg)",
    colorNeutral: "var(--gruvfg)",
    colorBorder: "var(--gruvbg-3)",
    colorRing: "var(--gruv-aqua)",
    colorDanger: "var(--gruv-red)",
    colorSuccess: "var(--gruv-green)",
    colorWarning: "var(--gruv-yellow)",
    colorShadow: "var(--gruvfg)",
    colorModalBackdrop: "var(--gruvfg)",
    fontFamily: "var(--font-geist-sans)",
    fontFamilyButtons: "var(--font-geist-sans)",
    fontFamilyMono: "var(--font-geist-mono)",
    borderRadius: "0.5rem",
  },
  elements: {
    card: {
      borderRadius: "1rem",
      borderWidth: "1px",
      borderColor: "var(--gruvbg-3)",
      boxShadow: "0 12px 32px -12px rgba(60, 56, 54, 0.25)",
    },
    headerTitle: {
      color: "var(--gruvfg)",
      fontWeight: 600,
    },
    headerSubtitle: {
      color: "var(--gruvfg-3)",
    },
    socialButtonsBlockButton: {
      borderColor: "var(--gruvbg-3)",
      color: "var(--gruvfg)",
      "&:hover": {
        borderColor: "var(--gruv-aqua)",
        backgroundColor: "var(--gruvbg-2)",
      },
    },
    dividerLine: {
      backgroundColor: "var(--gruvbg-3)",
    },
    dividerText: {
      color: "var(--gruvfg-3)",
    },
    formFieldLabel: {
      color: "var(--gruvfg-2)",
    },
    formFieldInput: {
      borderColor: "var(--gruvbg-3)",
      backgroundColor: "var(--gruvbg)",
      color: "var(--gruvfg)",
      "&:focus": {
        borderColor: "var(--gruv-aqua)",
      },
    },
    formButtonPrimary: {
      backgroundColor: "var(--gruvfg)",
      color: "var(--gruvbg)",
      "&:hover": {
        backgroundColor: "var(--gruv-aqua)",
      },
      "&:focus": {
        boxShadow: "none",
      },
    },
    footerActionLink: {
      color: "var(--gruv-aqua)",
      "&:hover": {
        color: "var(--gruvfg)",
      },
    },
    modalBackdrop: {
      backdropFilter: "blur(4px)",
    },
    userButtonPopoverCard: {
      borderRadius: "1rem",
      borderWidth: "1px",
      borderColor: "var(--gruvbg-3)",
      boxShadow: "0 12px 32px -12px rgba(60, 56, 54, 0.25)",
    },
    userButtonPopoverActionButton: {
      color: "var(--gruvfg)",
      "&:hover": {
        backgroundColor: "var(--gruvbg-2)",
      },
    },
    userButtonPopoverActionButtonIcon: {
      color: "var(--gruvfg-3)",
    },
    userButtonPopoverFooter: {
      borderColor: "var(--gruvbg-3)",
    },
    avatarBox: {
      borderRadius: "0.5rem",
    },
  },
};
