"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { removeAvatar, saveAvatar, sendFile, startAvatarUpload } from "@/lib/files/api";
import { AVATAR_TYPES, isAvatarType, MAX_AVATAR_SIZE } from "@/lib/files/rules";

/** The profile picture, with buttons to change or remove it. */
export function AvatarForm({ src, fallback }: { src: string | undefined; fallback: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);

  async function change(file: File) {
    if (!isAvatarType(file.type)) {
      toast.error("Choose a PNG, JPEG, WebP or GIF image.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error("Pictures can be at most 2 MB.");
      return;
    }
    setBusy("upload");
    try {
      const { key, upload } = await startAvatarUpload(file);
      await sendFile(upload, file, () => undefined, new AbortController().signal);
      await saveAvatar(key);
      toast.success("Picture updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change your picture.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      await removeAvatar();
      toast.success("Picture removed");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove your picture.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16 text-xl">
        {src && <AvatarImage src={src} alt="Your profile picture" />}
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => input.current?.click()}
        >
          <Camera />
          {busy === "upload" ? "Uploading…" : src ? "Change picture" : "Add picture"}
        </Button>
        {src && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => {
              void remove();
            }}
          >
            <Trash2 />
            {busy === "remove" ? "Removing…" : "Remove"}
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={AVATAR_TYPES.join(",")}
        hidden
        aria-label="Profile picture"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void change(file);
        }}
      />
    </div>
  );
}
