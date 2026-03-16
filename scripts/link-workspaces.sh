cd packages

for dir in $(ls -d */); do
  cd "$dir"
  pnpm link
  cd ..
done

for dir in converter generator ui; do
  cd "$dir"
  rm -f pnpm-workspace.yaml
  pnpm link @walcu-engineering/pdfme-common
  if [ "$dir" != "converter" ]; then
    pnpm link @walcu-engineering/pdfme-schemas
  fi
  if [ "$dir" = "ui" ]; then
    pnpm link @walcu-engineering/pdfme-converter
  fi
  cd ..
done
