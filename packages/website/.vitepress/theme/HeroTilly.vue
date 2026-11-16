<template>
  <figure class="tilly-wrapper">
    <img src="/tilly.svg" alt="Tilly" class="tilly-image" />
    <figcaption class="tilly-legend">
      Tilly is on a mission to change how we store prompts in our codebases. He doesn't care what anyone thinks. He will not rest until it's done.
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
  height: 192px;
  max-width: 100%;
  object-fit: contain;
}

@media (min-width: 640px) {
  .tilly-image {
    height: 256px;
  }
}

@media (min-width: 960px) {
  .tilly-image {
    height: 320px;
  }
}

.tilly-legend {
  margin-top: 14px;
  max-width: 320px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
  text-align: center;
  font-style: italic;
}
</style>
