import { BirthdayApp } from "../../components/birthday-app";

export const dynamic = "force-dynamic";

export default function GalleryPage({
  searchParams,
}: {
  searchParams?: { event?: string; pin?: string };
}) {
  return (
    <BirthdayApp
      initialGuestAccess={{
        eventCode: searchParams?.event?.toUpperCase() || "",
        pin: searchParams?.pin || "",
      }}
    />
  );
}
