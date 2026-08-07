/**
 * Shared Clerk theme, applied globally via <ClerkProvider appearance={clerkAppearance}>.
 * Drives the Sign in / Sign up modal and the UserButton popover so both match the
 * site's dark slate-and-purple palette instead of Clerk's default look.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--accent-primary)",
    colorPrimaryForeground: "var(--text-primary)",
    colorBackground: "var(--bg-surface)",
    colorForeground: "var(--text-primary)",
    colorMuted: "var(--bg-elevated)",
    colorMutedForeground: "var(--text-secondary)",
    colorInput: "var(--bg-base)",
    colorInputForeground: "var(--text-primary)",
    colorNeutral: "var(--text-primary)",
    colorBorder: "var(--hairline-strong)",
    colorRing: "var(--accent-primary)",
    colorDanger: "#f87171",
    colorSuccess: "#34d399",
    colorWarning: "#fbbf24",
    colorShadow: "rgba(0, 0, 0, 0.6)",
    colorModalBackdrop: "rgba(13, 17, 23, 0.7)",
    fontFamily: "var(--font-serif)",
    fontFamilyButtons: "var(--font-mono)",
    fontFamilyMono: "var(--font-mono)",
    borderRadius: "1rem",
  },
  elements: {
    card: {
      borderRadius: "1.25rem",
      borderWidth: "1px",
      borderColor: "var(--hairline-strong)",
      backgroundColor: "var(--bg-surface)",
      boxShadow: "0 24px 60px -20px rgba(0, 0, 0, 0.6)",
    },
    headerTitle: {
      color: "var(--text-primary)",
      fontWeight: 700,
    },
    headerSubtitle: {
      color: "var(--text-secondary)",
    },
    socialButtonsBlockButton: {
      borderColor: "var(--hairline-strong)",
      color: "var(--text-primary)",
      "&:hover": {
        borderColor: "var(--accent-primary)",
        backgroundColor: "var(--bg-elevated)",
      },
    },
    dividerLine: {
      backgroundColor: "var(--hairline-strong)",
    },
    dividerText: {
      color: "var(--text-secondary)",
    },
    formFieldLabel: {
      color: "var(--text-secondary)",
    },
    formFieldInput: {
      borderColor: "var(--hairline-strong)",
      backgroundColor: "var(--bg-base)",
      color: "var(--text-primary)",
      "&:focus": {
        borderColor: "var(--accent-primary)",
      },
    },
    formButtonPrimary: {
      backgroundColor: "var(--accent-primary)",
      color: "var(--text-primary)",
      "&:hover": {
        backgroundColor: "var(--accent-primary)",
        boxShadow: "0 0 24px var(--accent-glow)",
      },
      "&:focus": {
        boxShadow: "none",
      },
    },
    footerActionLink: {
      color: "var(--accent-secondary)",
      "&:hover": {
        color: "var(--text-primary)",
      },
    },
    modalBackdrop: {
      backdropFilter: "blur(6px)",
    },
    userButtonPopoverCard: {
      borderRadius: "1.25rem",
      borderWidth: "1px",
      borderColor: "var(--hairline-strong)",
      backgroundColor: "var(--bg-surface)",
      boxShadow: "0 24px 60px -20px rgba(0, 0, 0, 0.6)",
    },
    userButtonPopoverActionButton: {
      color: "var(--text-primary)",
      "&:hover": {
        backgroundColor: "var(--bg-elevated)",
      },
    },
    userButtonPopoverActionButtonIcon: {
      color: "var(--text-secondary)",
    },
    userButtonPopoverFooter: {
      borderColor: "var(--hairline-strong)",
    },
    avatarBox: {
      borderRadius: "0.5rem",
    },
  },
};
