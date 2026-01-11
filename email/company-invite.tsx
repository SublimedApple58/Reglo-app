import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

type CompanyInviteEmailProps = {
  companyName: string;
  inviteUrl: string;
  invitedByName?: string | null;
};

export default function CompanyInviteEmail({
  companyName,
  inviteUrl,
  invitedByName,
}: CompanyInviteEmailProps) {
  return (
    <Html>
      <Preview>Invite to join {companyName}</Preview>
      <Tailwind>
        <Head />
        <Body className="bg-white font-sans">
          <Container className="max-w-xl">
            <Heading>Join {companyName} on Reglo</Heading>
            <Text>
              {invitedByName
                ? `${invitedByName} invited you to join ${companyName}.`
                : `You have been invited to join ${companyName}.`}
            </Text>
            <Text>
              Click the button below to accept the invite and access the
              workspace.
            </Text>
            <Section className="my-6">
              <Button
                href={inviteUrl}
                className="rounded-lg bg-black px-6 py-3 text-white"
              >
                Accept invite
              </Button>
            </Section>
            <Text className="text-sm text-gray-500">
              If you did not expect this invite, you can ignore this email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
