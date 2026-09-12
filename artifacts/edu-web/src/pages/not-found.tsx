import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[hsl(var(--background))]">
      <Card className="mx-4 w-full max-w-md border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-[hsl(var(--accent))]" />
            <h1 className="display text-2xl font-bold">
              Không tìm thấy trang
            </h1>
          </div>

          <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">
            Đường dẫn này chưa có trong không gian EasyEdu.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
