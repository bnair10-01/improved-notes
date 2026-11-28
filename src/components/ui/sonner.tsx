import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // Below the notch, the Dynamic Island and the status bar, not under them (env() is 0 where there's no cutout).
      offset={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)", right: 16, left: 16, bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)", right: 12, left: 12, bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      // The app's own colours, in every theme and in light and dark, rather than Sonner's stock look.
      style={{
        "--normal-bg": "var(--popover)", "--normal-text": "var(--popover-foreground)", "--normal-border": "var(--border)",
        "--success-bg": "var(--popover)", "--success-text": "var(--popover-foreground)", "--success-border": "color-mix(in oklab, var(--primary) 40%, var(--border))",
        "--error-bg": "var(--popover)", "--error-text": "var(--popover-foreground)", "--error-border": "color-mix(in oklab, var(--destructive) 55%, var(--border))",
        "--warning-bg": "var(--popover)", "--warning-text": "var(--popover-foreground)", "--warning-border": "color-mix(in oklab, var(--uncertain, var(--primary)) 55%, var(--border))",
        "--info-bg": "var(--popover)", "--info-text": "var(--popover-foreground)", "--info-border": "var(--border)",
        "--border-radius": "0.9rem",
      } as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast: "group toast !font-sans !text-sm !shadow-lg !backdrop-blur-md",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground !rounded-md !font-medium",
          cancelButton: "!bg-secondary !text-secondary-foreground !rounded-md",
          success: "[&_[data-icon]]:!text-primary",
          error: "[&_[data-icon]]:!text-destructive",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
