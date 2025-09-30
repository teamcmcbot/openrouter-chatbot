# Mobile Performance Analysis & Recommendations

## 📊 Current Performance Summary

### Mobile vs Desktop Comparison

| Metric                | Mobile  | Desktop | Delta    | Status      |
| --------------------- | ------- | ------- | -------- | ----------- |
| **Performance Score** | 47      | 86      | -39      | ❌ Critical |
| **LCP**               | 18.5s   | ~2.5s   | +16s     | ❌ Critical |
| **TBT**               | 2,060ms | ~300ms  | +1,760ms | ❌ Critical |
| **FCP**               | 1.1s    | 0.2s    | +0.9s    | ⚠️ Warning  |
| **CLS**               | 0       | 0       | 0        | ✅ Good     |
| **Accessibility**     | 88      | 88      | 0        | ✅ Good     |
| **SEO**               | 100     | 100     | 0        | ✅ Good     |

### Critical Issues

**🚨 Largest Contentful Paint: 18.5 seconds**

- Target: < 2.5s
- Current: 18.5s
- **740% slower than target**

**🚨 Total Blocking Time: 2,060ms**

- Target: < 300ms
- Current: 2,060ms
- **687% slower than target**

**🚨 Time to Interactive: 18.8 seconds**

- Page unresponsive for almost 19 seconds on mobile

---

## 🔍 Root Cause Analysis

### 1. JavaScript Bundle Size (Primary Issue)

**Unused JavaScript: 421 KiB wasted**

```
/models/page.js
- Total Size: 464 KB
- Unused: 410 KB (88.4% waste!)
- Impact: +1,800ms to LCP

/layout.js
- Total Size: 829 KB
- Unused: 20.5 KB (2.5% waste)
```

**Main Thread Work: 3.4 seconds**

Breakdown:

- Script Evaluation: 1,982ms (58%)
- Script Parsing & Compilation: 779ms (23%)
- Other: 402ms (12%)
- Style & Layout: 112ms (3%)
- Rendering: 68ms (2%)
- Garbage Collection: 44ms (1%)

**JavaScript Execution Time: 2.7 seconds**

Mobile CPU is 4x slower than desktop (throttled), so JavaScript is devastating on mobile.

### 2. DOM Size: 1,859 Elements (Warning)

- **Target**: < 1,500 elements
- **Current**: 1,859 elements
- **Impact**: Slower style calculations, layout reflows

### 3. Mobile CPU Throttling

Mobile simulation uses:

- **4x CPU slowdown multiplier**
- Simulated "moto g power (2022)" device
- This amplifies JavaScript execution time significantly

---

## 🎯 Recommended Fixes (Priority Order)

### Priority 1: Code Splitting & Lazy Loading (Critical)

**Problem**: The `/models/page.js` bundle loads **464 KB** with 88% unused code.

**Solution**: Implement dynamic imports for heavy components.

**Changes Needed**:

```typescript
// Current: /src/app/models/page.tsx
// ALL components loaded upfront

// Proposed: Lazy load heavy components
const ModelFilters = dynamic(() => import("@/components/models/ModelFilters"), {
  loading: () => <FiltersSkeleton />,
  ssr: false, // Client-side only if filters don't need SEO
});

const ModelComparisonTable = dynamic(
  () => import("@/components/models/ModelComparisonTable"),
  { loading: () => <TableSkeleton /> }
);

const AdvancedFeatureMatrix = dynamic(
  () => import("@/components/models/AdvancedFeatureMatrix"),
  { ssr: false }
);
```

**Expected Impact**:

- Reduce initial bundle from 464 KB → ~150-200 KB
- Estimated LCP improvement: **-1,800ms** (from Lighthouse)
- Estimated TBT improvement: **-1,000ms+**

---

### Priority 2: Implement Route Segments & Parallel Routes

**Problem**: Entire models directory loads in one bundle.

**Solution**: Use Next.js 15 parallel routes for different sections.

**Proposed Structure**:

```
/models
├── @filters     - Filter sidebar (parallel route)
├── @grid        - Model grid view
├── @comparison  - Comparison table (lazy)
├── layout.tsx   - Orchestrates parallel routes
└── page.tsx     - Simplified main page
```

**Benefits**:

- Each section loads independently
- Filters don't block main content
- Comparison table only loads when toggled

---

### Priority 3: Tree Shaking & Bundle Analysis

**Problem**: 88% of models page JavaScript is unused.

**Solution**: Audit and remove unused dependencies.

**Action Items**:

1. **Run bundle analyzer**:

   ```bash
   npm install @next/bundle-analyzer
   ANALYZE=true npm run build
   ```

2. **Check for**:

   - Unused Supabase client methods
   - Unused UI component variants
   - Duplicate dependencies (e.g., multiple date libraries)
   - Heavy libraries imported but barely used

3. **Replace heavy libraries**:

   ```typescript
   // Bad: Import entire lodash
   import _ from "lodash";

   // Good: Import specific functions
   import debounce from "lodash/debounce";

   // Better: Use native JavaScript
   const debounce = (fn, delay) => {
     /* ... */
   };
   ```

---

### Priority 4: Virtualize Long Lists

**Problem**: DOM has 1,859 elements; models page likely renders all models at once.

**Solution**: Implement virtual scrolling for model list.

**Recommended Library**: `react-window` or `@tanstack/react-virtual`

```typescript
import { useVirtualizer } from "@tanstack/react-virtual";

function ModelList({ models }) {
  const parentRef = useRef();

  const virtualizer = useVirtualizer({
    count: models.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120, // Estimated row height
    overscan: 5, // Render 5 extra rows
  });

  return (
    <div ref={parentRef} style={{ height: "100vh", overflow: "auto" }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <ModelCard key={virtualRow.index} model={models[virtualRow.index]} />
        ))}
      </div>
    </div>
  );
}
```

**Expected Impact**:

- Reduce initial DOM from 1,859 → ~50-100 elements
- Faster initial render
- Less memory usage

---

### Priority 5: Optimize Client Components

**Problem**: Too many client components (`"use client"`) forcing hydration overhead.

**Solution**: Move state management closer to interactive elements.

**Pattern**:

```typescript
// Bad: Entire page is client component
"use client";
export default function ModelsPage() {
  const [filters, setFilters] = useState({});
  return <div>...</div>;
}

// Good: Only interactive parts are client components
// page.tsx (Server Component)
export default function ModelsPage() {
  return (
    <div>
      <StaticHeader />
      <FilterControls /> {/* "use client" only here */}
      <ModelGrid />
    </div>
  );
}
```

---

### Priority 6: Reduce Third-Party Scripts

**Check for**:

- Analytics scripts loading synchronously
- Chat widgets blocking main thread
- Social media embeds
- Ad scripts

**Solution**: Load all third-party scripts with `next/script` strategy:

```typescript
import Script from "next/script";

<Script
  src="https://analytics.example.com/script.js"
  strategy="lazyOnload" // or "afterInteractive"
/>;
```

---

### Priority 7: Image Optimization (If Applicable)

**Check**:

- Are model logos/images properly optimized?
- Using Next.js `<Image />` component?
- Proper `priority` flag for above-fold images?

**Solution**:

```typescript
import Image from 'next/image';

// Above-fold images
<Image
  src="/models/openai-logo.png"
  alt="OpenAI"
  width={100}
  height={100}
  priority // Preload this image
/>

// Below-fold images
<Image
  src="/models/anthropic-logo.png"
  alt="Anthropic"
  width={100}
  height={100}
  loading="lazy"
/>
```

---

## 📈 Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)

- [ ] Run bundle analyzer to identify biggest culprits
- [ ] Implement dynamic imports for filters/comparison table
- [ ] Add loading skeletons for lazy-loaded components
- [ ] Move third-party scripts to `strategy="lazyOnload"`

**Expected Result**: Performance score 47 → 60-65

---

### Phase 2: Structural Changes (3-5 days)

- [ ] Implement virtual scrolling for model list
- [ ] Refactor to parallel routes structure
- [ ] Convert unnecessary client components to server components
- [ ] Reduce DOM size from 1,859 → < 1,500 elements

**Expected Result**: Performance score 60-65 → 70-75

---

### Phase 3: Advanced Optimizations (1 week)

- [ ] Tree shake unused dependencies
- [ ] Replace heavy libraries with lighter alternatives
- [ ] Implement code splitting at route segment level
- [ ] Add service worker for offline caching (optional)

**Expected Result**: Performance score 70-75 → 80+

---

## 🧪 Testing Strategy

### 1. Local Testing

```bash
# Build production bundle
npm run build

# Start production server
npm start

# Run Lighthouse in mobile mode
npx lighthouse http://localhost:3000/models \
  --preset=perf \
  --form-factor=mobile \
  --throttling.cpuSlowdownMultiplier=4 \
  --view
```

### 2. Incremental Validation

After each change:

- [ ] Measure bundle size difference
- [ ] Check Chrome DevTools Performance tab
- [ ] Run Lighthouse mobile audit
- [ ] Verify no functionality broke

### 3. Real Device Testing

Test on actual mid-range Android devices:

- Samsung Galaxy A series
- Google Pixel 6/7
- OnePlus Nord

---

## 🎯 Target Metrics (Mobile)

### Short-term Goals (2-3 weeks)

| Metric            | Current | Target   | Status |
| ----------------- | ------- | -------- | ------ |
| Performance Score | 47      | 70+      | 🎯     |
| LCP               | 18.5s   | < 4.0s   | 🎯     |
| TBT               | 2,060ms | < 600ms  | 🎯     |
| Bundle Size       | 464 KB  | < 250 KB | 🎯     |

### Long-term Goals (2-3 months)

| Metric            | Target  | Strategy                     |
| ----------------- | ------- | ---------------------------- |
| Performance Score | 80+     | All optimizations complete   |
| LCP               | < 2.5s  | Edge caching + optimizations |
| TBT               | < 300ms | Aggressive code splitting    |
| DOM Size          | < 1,200 | Virtual scrolling            |

---

## 🛠️ Immediate Action Items

1. **Today**: Run bundle analyzer to see what's in that 464 KB

   ```bash
   npm install --save-dev @next/bundle-analyzer
   ```

   Add to `next.config.ts`:

   ```typescript
   const withBundleAnalyzer = require("@next/bundle-analyzer")({
     enabled: process.env.ANALYZE === "true",
   });

   module.exports = withBundleAnalyzer(nextConfig);
   ```

   Run: `ANALYZE=true npm run build`

2. **This Week**: Implement lazy loading for heavy components

3. **Next Week**: Virtual scrolling for model list

4. **Month 1**: Complete Phase 1 & 2 optimizations

---

## 📚 Resources

- [Next.js Bundle Analyzer](https://www.npmjs.com/package/@next/bundle-analyzer)
- [React Window (Virtual Scrolling)](https://react-window.vercel.app/)
- [TanStack Virtual](https://tanstack.com/virtual/latest)
- [Web.dev Performance Guides](https://web.dev/performance/)
- [Next.js Performance Best Practices](https://nextjs.org/docs/app/building-your-application/optimizing)

---

## 💡 Key Takeaways

1. **Mobile performance is 47** primarily due to **88% unused JavaScript** in models page bundle
2. **Quick win**: Dynamic imports can save ~1,800ms LCP immediately
3. **Medium effort**: Virtual scrolling reduces DOM from 1,859 → ~100 elements
4. **Long-term**: Parallel routes + tree shaking gets you to 80+ score
5. **Don't forget**: Test on real devices, not just Lighthouse simulation

---

## ✅ Lighthouse CI Configuration Recommendation

Given the current mobile performance (47), your Lighthouse CI should:

**Option A: Desktop-Only (Current)**

```json
{
  "settings": {
    "preset": "desktop"
  },
  "assertions": {
    "categories:performance": ["error", { "minScore": 0.75 }] // Realistic
  }
}
```

**Option B: Mobile + Desktop with Realistic Thresholds**

```json
{
  "settings": [{ "preset": "desktop" }, { "preset": "mobile" }],
  "assertions": {
    "categories:performance": ["error", { "minScore": 0.6 }], // Mobile-friendly
    "largest-contentful-paint": ["error", { "maxNumericValue": 4000 }], // Mobile 4s
    "total-blocking-time": ["error", { "maxNumericValue": 800 }] // Mobile 800ms
  }
}
```

**My Recommendation**: Start with **Option A** (desktop-only, 75% threshold), implement optimizations, then add mobile testing once you hit 70+ mobile score.
