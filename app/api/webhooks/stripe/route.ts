import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { updateOrderToPaid } from '@/lib/actions/order.actions';
import { prisma } from '@/db/prisma';
import { persistAutoscuolaStripeConnectAccountStatus } from '@/lib/autoscuole/stripe-connect';

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json(
        { success: false, message: 'Missing stripe-signature header' },
        { status: 400 },
      );
    }

    const event = await Stripe.webhooks.constructEvent(
      await req.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );

    if (event.type === 'charge.succeeded') {
      const { object } = event.data;
      if (object.metadata?.orderId) {
        await updateOrderToPaid({
          orderId: object.metadata.orderId,
          paymentResult: {
            id: object.id,
            status: 'COMPLETED',
            email_address: object.billing_details.email!,
            pricePaid: (object.amount / 100).toFixed(),
          },
        });
      }
      return NextResponse.json({ success: true, handled: 'charge.succeeded' });
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      if (paymentIntent.metadata?.kind === 'autoscuola_appointment_payment') {
        const paymentRecordId = paymentIntent.metadata.appointmentPaymentId;
        if (paymentRecordId) {
          const payment = await prisma.autoscuolaAppointmentPayment.findUnique({
            where: { id: paymentRecordId },
            include: {
              appointment: {
                select: {
                  id: true,
                  status: true,
                  priceAmount: true,
                  penaltyAmount: true,
                  penaltyCutoffAt: true,
                  cancelledAt: true,
                  paymentRequired: true,
                  paidAmount: true,
                },
              },
            },
          });

          if (payment?.appointment && payment.status !== 'succeeded') {
            const latestChargeId =
              typeof paymentIntent.latest_charge === 'string'
                ? paymentIntent.latest_charge
                : paymentIntent.latest_charge?.id ?? null;

            await prisma.$transaction(async (tx) => {
              await tx.autoscuolaAppointmentPayment.update({
                where: { id: payment.id },
                data: {
                  status: 'succeeded',
                  paidAt: new Date(),
                  stripePaymentIntentId: paymentIntent.id,
                  stripeChargeId: latestChargeId,
                  nextAttemptAt: null,
                  attemptCount: Math.max(payment.attemptCount, 1),
                  failureCode: null,
                  failureMessage: null,
                },
              });

              await tx.autoscuolaAppointment.update({
                where: { id: payment.appointment.id },
                data: {
                  paidAmount: {
                    increment: payment.amount,
                  },
                },
              });
            });

            const appointment = await prisma.autoscuolaAppointment.findUnique({
              where: { id: payment.appointment.id },
              select: {
                id: true,
                paymentRequired: true,
                status: true,
                priceAmount: true,
                penaltyAmount: true,
                penaltyCutoffAt: true,
                cancelledAt: true,
                paidAmount: true,
              },
            });

            if (appointment) {
              const paid = Math.round(Number(appointment.paidAmount) * 100);
              const penalty = Math.round(Number(appointment.penaltyAmount) * 100);
              const total = Math.round(Number(appointment.priceAmount) * 100);
              const normalizedStatus = (appointment.status ?? '').trim().toLowerCase();
              const cancelledBeforeCutoff =
                normalizedStatus === 'cancelled' &&
                appointment.cancelledAt &&
                appointment.penaltyCutoffAt &&
                appointment.cancelledAt.getTime() < appointment.penaltyCutoffAt.getTime();
              const finalAmount =
                normalizedStatus === 'no_show'
                  ? penalty
                  : normalizedStatus === 'cancelled'
                  ? cancelledBeforeCutoff
                    ? 0
                    : penalty
                  : total;

              const paymentStatus = !appointment.paymentRequired
                ? 'not_required'
                : finalAmount === 0
                ? 'waived'
                : paid >= finalAmount
                ? 'paid'
                : paid > 0
                ? 'partial_paid'
                : 'pending_penalty';

              await prisma.autoscuolaAppointment.update({
                where: { id: appointment.id },
                data: { paymentStatus },
              });
            }
          }
        }
      }
      return NextResponse.json({ success: true, handled: 'payment_intent.succeeded' });
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      if (paymentIntent.metadata?.kind === 'autoscuola_appointment_payment') {
        const paymentRecordId = paymentIntent.metadata.appointmentPaymentId;
        if (paymentRecordId) {
          await prisma.autoscuolaAppointmentPayment.updateMany({
            where: {
              id: paymentRecordId,
              status: { not: 'succeeded' },
            },
            data: {
              status: 'failed',
              failureCode:
                paymentIntent.last_payment_error?.code ?? 'payment_intent_failed',
              failureMessage:
                paymentIntent.last_payment_error?.message ??
                'Payment intent failed from webhook.',
            },
          });
        }
      }
      return NextResponse.json({ success: true, handled: 'payment_intent.payment_failed' });
    }

    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;
      const connection = await prisma.integrationConnection.findFirst({
        where: {
          provider: 'STRIPE_CONNECT',
          externalAccountId: account.id,
        },
        select: {
          companyId: true,
        },
      });

      if (connection) {
        await persistAutoscuolaStripeConnectAccountStatus({
          companyId: connection.companyId,
          account,
        });
      }

      return NextResponse.json({ success: true, handled: 'account.updated' });
    }

    return NextResponse.json({ success: true, handled: event.type });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Webhook error' },
      { status: 400 },
    );
  }
}
