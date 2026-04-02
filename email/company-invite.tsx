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
  const baseUrl = serverUrl.replace(/\/$/, '');
  const logoFullUrl = `${baseUrl}/images/reglo_logo_full.png`;
  const logoIconUrl = `${baseUrl}/images/reglo_new_logo.png`;

  return (
    <Html>
      <Preview>Invito a {companyName}</Preview>
      <Tailwind>
        <Head />
        <Body className="font-sans" style={{ backgroundColor: '#FFFFFF' }}>
          <Container className="max-w-[480px] mx-auto" style={{ padding: '40px 20px' }}>
            <Section style={{ paddingBottom: 28 }}>
              <Img
                src={logoFullUrl}
                width="140"
                height="38"
                alt="Reglo"
                style={{ display: 'block', width: 140, height: 'auto' }}
              />
            </Section>

            <Section>
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

            <Section style={{ paddingTop: 32 }}>
              <div style={{ height: 1, background: '#F1F5F9', marginBottom: 16 }} />
              <table role="presentation" cellPadding="0" cellSpacing="0" style={{ border: 'none' }}>
                <tr>
                  <td valign="middle" style={{ paddingRight: 8 }}>
                    <Img src={logoIconUrl} width="20" height="20" alt="" style={{ display: 'block', borderRadius: 4 }} />
                  </td>
                  <td valign="middle">
                    <Text className="m-0 text-xs" style={{ color: '#94A3B8' }}>
                      <Link href={serverUrl} style={{ color: '#94A3B8', textDecoration: 'none' }}>reglo.it</Link> · La tua autoscuola, semplice.
                    </Text>
                  </td>
                </tr>
              </table>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
