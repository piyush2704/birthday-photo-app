import { BirthdayApp } from "../components/birthday-app";

export default function HomePage({
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
