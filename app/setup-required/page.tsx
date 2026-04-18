export default function SetupRequired() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
      <h1 className="text-xl font-bold">尚未設定</h1>
      <p className="mt-2 text-neutral-600">
        <code className="rounded bg-neutral-200 px-1">NEXT_PUBLIC_LIFF_ID</code>{" "}
        沒有設定,請先填完 <code>.env</code> 再重新部署。
      </p>
    </main>
  );
}
