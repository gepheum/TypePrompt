<template>
  <figure class="tilly-wrapper">
    <img src="/tilly.svg" alt="Tilly" class="tilly-image" />
    <figcaption class="tilly-legend">
      Tilly wears sunglasses indoors. Don't ask why. Just stop putting prompts in string literals.
    </figcaption>
  </figure>
</template>

<style scoped>
.tilly-wrapper {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
}

.tilly-image {
  width: auto;
  height: 180px;
  max-width: 100%;
  object-fit: contain;
}

@media (min-width: 640px) {
  .tilly-image {
    height: 220px;
  }
}

@media (min-width: 960px) {
  .tilly-image {
    height: 240px;
  }
}

.tilly-legend {
  margin-top: 8px;
  max-width: 300px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--vp-c-text-2);
  text-align: center;
  font-style: italic;
}

.nowrap {
  white-space: nowrap;
}
</style>
