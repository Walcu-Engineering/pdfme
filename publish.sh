#!/bin/bash

# Publish script for pdfme monorepo packages
# Publishes packages in dependency order to ensure proper resolution

set -e # Exit on any error

PUBLISH_ARGS="$@"

echo "Starting publish process for @walcu-engineering/pdfme-* packages..."

# 1. Publish pdf-lib first (no internal dependencies)
# Foundation package - all other packages depend on this
echo "Publishing @walcu-engineering/pdfme-pdf-lib (foundation package)..."
cd packages/pdf-lib
pnpm publish $PUBLISH_ARGS
cd ../..

# 2. Publish common (depends on pdf-lib)
# Core types and utilities used across all packages
echo "Publishing @walcu-engineering/pdfme-common (depends on pdf-lib)..."
cd packages/common
pnpm publish $PUBLISH_ARGS
cd ../..

# 3. Publish converter (depends on common and pdf-lib)
# PDF conversion and rendering utilities
echo "Publishing @walcu-engineering/pdfme-converter (depends on common, pdf-lib)..."
cd packages/converter
pnpm publish $PUBLISH_ARGS
cd ../..

# 4. Publish schemas (depends on common)
# Built-in field types (text, image, table, barcodes)
echo "Publishing @walcu-engineering/pdfme-schemas (depends on common)..."
cd packages/schemas
pnpm publish $PUBLISH_ARGS
cd ../..

# 5. Publish generator (peerDepends on common and schemas)
# PDF generation engine
echo "Publishing @walcu-engineering/pdfme-generator (peerDepends on common, schemas)..."
cd packages/generator
pnpm publish $PUBLISH_ARGS
cd ../..

# 6. Publish ui (peerDepends on common and schemas, depends on converter)
# React components (Designer, Form, Viewer)
echo "Publishing @walcu-engineering/pdfme-ui (peerDepends on common, schemas; depends on converter)..."
cd packages/ui
pnpm publish $PUBLISH_ARGS
cd ../..

# 7. Publish manipulator (depends on pdf-lib)
# PDF modification utilities
echo "Publishing @walcu-engineering/pdfme-manipulator (depends on pdf-lib)..."
cd packages/manipulator
pnpm publish $PUBLISH_ARGS
cd ../..

echo "All packages published successfully!"
