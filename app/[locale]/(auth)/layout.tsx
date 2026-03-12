export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative min-h-svh w-full overflow-hidden bg-gradient-to-br from-pink-100 via-white to-yellow-50">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(236,72,153,0.15),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(250,204,21,0.12),transparent_50%)]" />
      <div className="relative mx-auto flex min-h-svh w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
