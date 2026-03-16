cd packages

for dir in $(ls -d */); do
  cd "$dir"
  pnpm link
  cd ..
done

for dir in generator ui; do
  cd "$dir"
  pnpm link @pdfme/common
  pnpm link @pdfme/schemas
  if [ "$dir" = "ui" ]; then
    pnpm link @pdfme/converter
  fi
  cd ..
done
