import torch, sys, time
from diffusers import AutoPipelineForText2Image
torch.set_num_threads(4)
pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sd-turbo", torch_dtype=torch.float32, variant="fp16")
prompt = ("empty small attic bedroom at night, photographed from a low angle with a phone, slanted white wooden plank ceiling "
          "lit in cold teal blue, a desk in the background glowing with a deep red LED strip, a small monitor, dark moody cinematic, "
          "grainy realistic photo, no people")
for seed in [1, 2, 3, 4]:
    t = time.time()
    g = torch.Generator().manual_seed(seed)
    im = pipe(prompt=prompt, num_inference_steps=4, guidance_scale=0.0, width=512, height=896, generator=g).images[0]
    im.save(f"set_{seed}.png"); print(seed, round(time.time() - t, 1), "s", flush=True)
