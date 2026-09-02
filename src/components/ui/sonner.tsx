import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      /*
       * Toasts are `fixed`, so the body's safe-area padding never applied to
       * them and a top-positioned toast landed under the status bar in the
       * native shell. Sonner's own defaults (24px desktop, 16px mobile) are
       * kept and the inset is added on top; omitted sides keep their defaults.
       */
      offset={{ top: "calc(24px + var(--safe-area-inset-top))" }}
      mobileOffset={{ top: "calc(16px + var(--safe-area-inset-top))" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
