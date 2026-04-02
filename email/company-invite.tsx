import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

type CompanyInviteEmailProps = {
  companyName: string;
  inviteUrl: string;
  mobileInviteUrl?: string | null;
  invitedByName?: string | null;
};

export default function CompanyInviteEmail({
  companyName,
  inviteUrl,
  mobileInviteUrl,
  invitedByName,
}: CompanyInviteEmailProps) {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'https://app.reglo.it';
  const logoUrl = `${serverUrl.replace(/\/$/, '')}/images/R_logo.png`;

  return (
    <Html>
      <Preview>Invito a {companyName}</Preview>
      <Tailwind>
        <Head />
        <Body className="font-sans" style={{ backgroundColor: '#F8FAFC' }}>
          <Container className="max-w-[520px] mx-auto" style={{ padding: '40px 16px' }}>
            <Section className="text-center" style={{ paddingBottom: 28 }}>
              <Img
                src={logoUrl}
                width="44"
                height="44"
                alt="Reglo"
                className="mx-auto"
                style={{ display: 'block', margin: '0 auto' }}
              />
            </Section>

            <Section
              className="rounded-2xl"
              style={{ backgroundColor: '#FFFFFF', padding: '32px 28px', borderRadius: 16 }}
            >
              <Heading className="m-0 text-[20px] font-semibold" style={{ color: '#1E293B' }}>
                Invito a {companyName}
              </Heading>
              <Text className="m-0 mt-3 text-[15px]" style={{ color: '#1E293B', lineHeight: '1.7' }}>
                {invitedByName
                  ? `${invitedByName} ti ha invitato a entrare in ${companyName}.`
                  : `Sei stato invitato a entrare in ${companyName}.`}
              </Text>
              <Text className="m-0 mt-1 text-sm" style={{ color: '#64748B' }}>
                Clicca qui sotto per accettare l'invito.
              </Text>
              <Section className="mt-6">
                <Button
                  href={mobileInviteUrl ?? inviteUrl}
                  className="rounded-xl px-6 py-3 text-[14px] font-semibold"
                  style={{
                    backgroundColor: '#1E293B',
                    color: '#FFFFFF',
                    borderRadius: 12,
                  }}
                >
                  {mobileInviteUrl ? "Entra in autoscuola" : "Accetta invito"}
                </Button>
              </Section>
              {mobileInviteUrl ? (
                <Section className="mt-3">
                  <Text className="m-0 text-xs" style={{ color: '#94A3B8' }}>
                    Se non si apre l&apos;app:{' '}
                    <Link href={inviteUrl} style={{ color: '#64748B' }}>
                      apri su web
                    </Link>
                  </Text>
                </Section>
              ) : null}
            </Section>

            <Section className="text-center" style={{ paddingTop: 24 }}>
              <Text className="m-0 text-xs" style={{ color: '#94A3B8' }}>
                <Link href={serverUrl} style={{ color: '#94A3B8', textDecoration: 'none' }}>
                  Reglo
                </Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
