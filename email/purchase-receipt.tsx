import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import { Order } from '@/types';
import { formatCurrency } from '@/lib/utils';
require('dotenv').config();

PurchaseReceiptEmail.PreviewProps = {
  order: {
    id: crypto.randomUUID(),
    userId: '123',
    user: {
      name: 'John Doe',
      email: 'test@test.com',
    },
    paymentMethod: 'Stripe',
    createdAt: new Date(),
    totalPrice: '100',
    taxPrice: '10',
    shippingPrice: '10',
    itemsPrice: '80',
    orderitems: [
      {
        productId: '1',
        slug: 'product-1',
        image: '/images/product-1.jpg',
        name: 'Product 1',
        qty: 2,
        price: '40',
      },
      {
        productId: '2',
        slug: 'product-2',
        image: '/images/product-2.jpg',
        name: 'Product 2',
        qty: 1,
        price: '40',
      },
    ],
    isDelivered: true,
    deliveredAt: new Date(),
    isPaid: true,
    paidAt: new Date(),
    paymentResult: {
      id: '123',
      status: 'succeeded',
      pricePaid: '100',
      email_address: 'test@test.com',
    },
  },
} satisfies OrderInformationProps;

const dateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

type OrderInformationProps = {
  order: Order;
};

export default function PurchaseReceiptEmail({ order }: OrderInformationProps) {
  const primary = '#324D7A';
  const accent = '#AFE2D4';
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'https://app.reglo.it';
  const footerLogo =
    process.env.EMAIL_FOOTER_LOGO ||
    `${serverUrl.replace(/\/$/, '')}/assets/exented_logo.png`;

  return (
    <Html>
      <Preview>View order receipt</Preview>
      <Tailwind>
        <Head />
        <Body className='font-sans' style={{ backgroundColor: '#F2FBF8' }}>
          <Container className='max-w-xl'>
            <Section
              className="rounded-[28px] overflow-hidden border"
              style={{ borderColor: '#D8ECE7', backgroundColor: '#ffffff' }}
            >
              <Section className="px-6 py-5" style={{ backgroundColor: primary }}>
                <Text className="m-0 text-white text-xs font-semibold uppercase tracking-[0.2em]">
                  Reglo
                </Text>
                <Heading className="m-0 mt-2 text-white text-[22px] font-semibold">
                  Ricevuta acquisto
                </Heading>
                <Text className="m-0 mt-2 text-white/90 text-sm">
                  Automations &amp; Docs
                </Text>
              </Section>

              <Section className="px-6 py-6">
              <Row>
                <Column>
                  <Text className='mb-0 mr-4 text-gray-500 whitespace-nowrap text-nowrap'>
                    Order ID
                  </Text>
                  <Text className='mt-0 mr-4'>{order.id.toString()}</Text>
                </Column>
                <Column>
                  <Text className='mb-0 mr-4 text-gray-500 whitespace-nowrap text-nowrap'>
                    Purchase Date
                  </Text>
                  <Text className='mt-0 mr-4'>
                    {dateFormatter.format(order.createdAt)}
                  </Text>
                </Column>
                <Column>
                  <Text className='mb-0 mr-4 text-gray-500 whitespace-nowrap text-nowrap'>
                    Price Paid
                  </Text>
                  <Text className='mt-0 mr-4'>
                    {formatCurrency(order.totalPrice)}
                  </Text>
                </Column>
              </Row>
              </Section>

              <Section
                className="mx-6 my-6 rounded-2xl border p-5"
                style={{ borderColor: '#D8ECE7', backgroundColor: '#ffffff' }}
              >
                {order.orderitems.map((item) => (
                  <Row key={item.productId} className='mt-6'>
                    <Column className='w-20'>
                      <Img
                        width='80'
                        alt={item.name}
                        className='rounded'
                        src={
                          item.image.startsWith('/')
                            ? `${process.env.NEXT_PUBLIC_SERVER_URL}${item.image}`
                            : item.image
                        }
                      />
                    </Column>
                    <Column className='align-top' style={{ color: primary }}>
                      {item.name} x {item.qty}
                    </Column>
                    <Column align='right' className='align-top' style={{ color: primary }}>
                      {formatCurrency(item.price)}
                    </Column>
                  </Row>
                ))}

                <Section className="mt-6 pt-4 border-t" style={{ borderColor: '#D8ECE7' }}>
                  {[
                    { name: 'Items', price: order.itemsPrice },
                    { name: 'Tax', price: order.taxPrice },
                    { name: 'Shipping', price: order.shippingPrice },
                    { name: 'Total', price: order.totalPrice },
                  ].map(({ name, price }) => (
                    <Row key={name} className='py-1'>
                      <Column align='right' style={{ color: primary }}>
                        {name}:
                      </Column>
                      <Column align='right' width={90} className='align-top'>
                        <Text className='m-0' style={{ color: primary }}>
                          {formatCurrency(price)}
                        </Text>
                      </Column>
                    </Row>
                  ))}
                </Section>
              </Section>

              <Section className="px-6 pb-6">
                <Section className="mt-2 pt-6 border-t" style={{ borderColor: '#D8ECE7' }}>
                  <Img
                    src={footerLogo}
                    width="400"
                    height="108"
                    alt="Reglo"
                    className="w-full"
                    style={{ display: 'block', width: '100%', height: 'auto' }}
                  />
                  <Text className="m-0 mt-2 text-xs text-gray-500 text-center">
                    Grazie per aver scelto Reglo.
                  </Text>
                </Section>
              </Section>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
