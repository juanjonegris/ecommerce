import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface KpiTileProps {
  label: string;
  value: string | number;
  sublabel?: string;
  testid?: string;
}

export function KpiTile({ label, value, sublabel, testid }: KpiTileProps): React.ReactElement {
  return (
    <Card data-testid={testid ?? 'admin-kpi-tile'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold" data-testid="admin-kpi-value">
          {value}
        </p>
        {sublabel ? <p className="text-xs text-muted-foreground mt-1">{sublabel}</p> : null}
      </CardContent>
    </Card>
  );
}
