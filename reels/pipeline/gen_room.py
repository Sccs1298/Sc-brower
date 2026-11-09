import torch
from diffusers import AutoPipelineForText2Image
torch.set_num_threads(4)
pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sd-turbo")
prompt = ("photo of a dark attic bedroom at night from a very low camera angle looking up, slanted ceiling of white wooden planks "
          "filling the top of the image, lit in cold dim teal light, on the left a desk with a bright red LED strip glowing red on the wall, "
          "dark room, grainy phone photo, moody, realistic")
for seed in [21,22,23,24,25,26]:
    g = torch.Generator().manual_seed(seed)
    pipe(prompt=prompt, num_inference_steps=4, guidance_scale=0.0, width=512, height=896, generator=g).images[0].save(f"r_{seed}.png")
    print(seed, flush=True)
