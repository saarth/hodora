import { Link } from "@tanstack/react-router";
import { Loader2, PencilLine, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AddRoutesPanel({
  onUploadClick,
  uploading = false,
  className,
}: {
  onUploadClick: () => void;
  uploading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("surface flex flex-col gap-2 p-4", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Add routes
      </h2>
      <Button variant="secondary" onClick={onUploadClick} disabled={uploading}>
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        Upload GPX
      </Button>
      <Button asChild variant="secondary">
        <Link to="/plan">
          <PencilLine className="size-4" />
          Draw route
        </Link>
      </Button>
    </div>
  );
}
