import { BirthdayApp } from "../../components/birthday-app";

export default function UploadPage({
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
